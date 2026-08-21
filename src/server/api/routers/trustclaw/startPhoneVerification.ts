import { randomInt } from "crypto";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { isTwilioConfigured, sendSms } from "~/server/clients/twilio";
import { startPhoneVerificationInput } from "./startPhoneVerification.schema";

const VERIFY_CODE_TTL_MS = 10 * 60 * 1000;

export const startPhoneVerification = protectedProcedure
  .input(startPhoneVerificationInput)
  .mutation(async ({ ctx, input }) => {
    if (!isTwilioConfigured()) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "SMS isn't live yet on this deployment (waiting on Twilio setup). The number can be verified as soon as it is.",
      });
    }

    const instance = await db.composioClawInstance.findUnique({
      where: { userId: ctx.session.user.id },
      select: { id: true },
    });
    if (!instance) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No Claw by Composio instance found. Create one first.",
      });
    }

    const code = randomInt(100000, 1000000).toString();
    await db.composioClawInstance.update({
      where: { id: instance.id },
      data: {
        eaPhoneNumber: input.phoneNumber,
        eaPhoneVerifiedAt: null,
        eaPhoneVerifyCode: code,
        eaPhoneVerifyExpiresAt: new Date(Date.now() + VERIFY_CODE_TTL_MS),
      },
    });

    const sent = await sendSms(
      input.phoneNumber,
      `Your Claw verification code is ${code}. It expires in 10 minutes.`,
    );
    if (!sent) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Couldn't send the verification text. Check the number and try again.",
      });
    }

    return { sent: true };
  });
