import { randomInt } from "crypto";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { isTwilioConfigured, sendSms } from "~/server/clients/twilio";
import { slidingWindowCheck } from "~/server/clients/redis";
import { startPhoneVerificationInput } from "./startPhoneVerification.schema";

const VERIFY_CODE_TTL_MS = 10 * 60 * 1000;

// Every send bills the owner's single Twilio account and can hit any E.164
// number, so an unthrottled endpoint is an SMS-pump / toll-fraud primitive.
// Two ceilings: a tight per-user cooldown, and a global cap that bounds total
// owner spend even across many accounts.
const PER_USER_WINDOW_MS = 60 * 60 * 1000; // 1h
const PER_USER_MAX = 3;
const GLOBAL_WINDOW_MS = 60 * 60 * 1000; // 1h
const GLOBAL_MAX = 20;

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

    const userId = ctx.session.user.id;

    // The rate limit is the ONLY ceiling on owner-funded SMS here, so this must
    // fail CLOSED: slidingWindowCheck returns "unavailable" when Redis is
    // unconfigured OR unreachable, and either is treated as a block (a brief
    // false-deny beats an un-throttled SMS pump during a Redis outage).
    const [userGate, globalGate] = await Promise.all([
      slidingWindowCheck(
        `ea-verify-send:${userId}`,
        PER_USER_WINDOW_MS,
        PER_USER_MAX,
      ),
      slidingWindowCheck("ea-verify-send:global", GLOBAL_WINDOW_MS, GLOBAL_MAX),
    ]);
    if (userGate === "unavailable" || globalGate === "unavailable") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "SMS verification is temporarily unavailable. Try again later.",
      });
    }
    if (userGate === "deny" || globalGate === "deny") {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message:
          "Too many verification texts. Wait a bit and try again (max a few per hour).",
      });
    }

    const instance = await db.composioClawInstance.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!instance) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No Claw by Composio instance found. Create one first.",
      });
    }

    // A number already verified by ANOTHER instance can't be claimed here - the
    // partial unique index enforces it at write time too, but reject early with
    // a clean message and, crucially, WITHOUT sending a code to that number
    // (which would let an attacker text-bomb a victim who owns it elsewhere).
    const claimedElsewhere = await db.composioClawInstance.findFirst({
      where: {
        eaPhoneNumber: input.phoneNumber,
        eaPhoneVerifiedAt: { not: null },
        id: { not: instance.id },
      },
      select: { id: true },
    });
    if (claimedElsewhere) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "That number is already verified on another account.",
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
        eaPhoneVerifyAttempts: 0,
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
