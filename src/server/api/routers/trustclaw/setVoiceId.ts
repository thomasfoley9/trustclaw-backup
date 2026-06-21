import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { setVoiceIdInput } from "./setVoiceId.schema";

export const setVoiceId = protectedProcedure
  .input(setVoiceIdInput)
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    // Validate the instance exists first (consistent with the other settings
    // mutations) so a missing instance returns a clean NOT_FOUND instead of a
    // raw Prisma P2025 "record not found" crash.
    const instance = await db.composioClawInstance.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!instance) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Agent instance not found.",
      });
    }

    await db.composioClawInstance.update({
      where: { userId },
      data: { voiceId: input.voiceId },
    });
    return { ok: true as const };
  });
