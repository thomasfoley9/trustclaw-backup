import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { confirmPhoneVerificationInput } from "./confirmPhoneVerification.schema";

export const confirmPhoneVerification = protectedProcedure
  .input(confirmPhoneVerificationInput)
  .mutation(async ({ ctx, input }) => {
    const instance = await db.composioClawInstance.findUnique({
      where: { userId: ctx.session.user.id },
      select: {
        id: true,
        eaPhoneVerifyCode: true,
        eaPhoneVerifyExpiresAt: true,
      },
    });
    if (!instance) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No Claw by Composio instance found. Create one first.",
      });
    }

    const valid =
      instance.eaPhoneVerifyCode === input.code &&
      instance.eaPhoneVerifyExpiresAt !== null &&
      instance.eaPhoneVerifyExpiresAt > new Date();

    if (!valid) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Wrong or expired code. Start verification again.",
      });
    }

    await db.composioClawInstance.update({
      where: { id: instance.id },
      data: {
        eaPhoneVerifiedAt: new Date(),
        eaPhoneVerifyCode: null,
        eaPhoneVerifyExpiresAt: null,
      },
    });

    return { verified: true };
  });
