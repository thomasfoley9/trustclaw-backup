import { timingSafeEqual } from "crypto";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { slidingWindowAllow } from "~/server/clients/redis";
import { confirmPhoneVerificationInput } from "./confirmPhoneVerification.schema";

// The code is a 6-digit value (~10^6 space). Without a cap an attacker who set
// their instance's eaPhoneNumber to a victim's number could brute the code
// within the 10-minute TTL and hijack that number. Two limits: a per-user
// request throttle and a hard wrong-guess counter that burns the code.
const MAX_ATTEMPTS = 5;
const CONFIRM_WINDOW_MS = 10 * 60 * 1000;
const CONFIRM_MAX = 10;

function codesMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual throws on length mismatch - guard first.
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const confirmPhoneVerification = protectedProcedure
  .input(confirmPhoneVerificationInput)
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const allowed = await slidingWindowAllow(
      `ea-verify-confirm:${userId}`,
      CONFIRM_WINDOW_MS,
      CONFIRM_MAX,
    );
    if (!allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many attempts. Wait a few minutes and try again.",
      });
    }

    const instance = await db.composioClawInstance.findUnique({
      where: { userId },
      select: {
        id: true,
        eaPhoneNumber: true,
        eaPhoneVerifyCode: true,
        eaPhoneVerifyExpiresAt: true,
        eaPhoneVerifyAttempts: true,
      },
    });
    if (!instance) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No Claw by Composio instance found. Create one first.",
      });
    }

    if (
      !instance.eaPhoneVerifyCode ||
      instance.eaPhoneVerifyExpiresAt === null ||
      instance.eaPhoneVerifyExpiresAt <= new Date()
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No active code. Start verification again.",
      });
    }

    if (!codesMatch(instance.eaPhoneVerifyCode, input.code)) {
      // Atomic increment so concurrent wrong guesses can't lose-update the
      // counter and slip past the cap (the per-user rate limit above is the
      // outer bound; this keeps the inner counter honest under a burst).
      const bumped = await db.composioClawInstance.update({
        where: { id: instance.id },
        data: { eaPhoneVerifyAttempts: { increment: 1 } },
        select: { eaPhoneVerifyAttempts: true },
      });
      // Burn the code once too many wrong guesses land - forces a fresh
      // start-verification (itself rate-limited), so the code space can't be
      // walked within one TTL.
      if (bumped.eaPhoneVerifyAttempts >= MAX_ATTEMPTS) {
        await db.composioClawInstance.update({
          where: { id: instance.id },
          data: {
            eaPhoneVerifyCode: null,
            eaPhoneVerifyExpiresAt: null,
            eaPhoneVerifyAttempts: 0,
          },
        });
      }
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          bumped.eaPhoneVerifyAttempts >= MAX_ATTEMPTS
            ? "Too many wrong codes. Start verification again."
            : "Wrong code. Check the text and try again.",
      });
    }

    // Correct code. Re-check the number isn't now verified elsewhere (a race
    // since start), then claim it. The partial unique index is the final
    // backstop - catch its violation and report cleanly.
    if (instance.eaPhoneNumber) {
      const claimedElsewhere = await db.composioClawInstance.findFirst({
        where: {
          eaPhoneNumber: instance.eaPhoneNumber,
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
    }

    try {
      await db.composioClawInstance.update({
        where: { id: instance.id },
        data: {
          eaPhoneVerifiedAt: new Date(),
          eaPhoneVerifyCode: null,
          eaPhoneVerifyExpiresAt: null,
          eaPhoneVerifyAttempts: 0,
        },
      });
    } catch {
      throw new TRPCError({
        code: "CONFLICT",
        message: "That number is already verified on another account.",
      });
    }

    return { verified: true };
  });
