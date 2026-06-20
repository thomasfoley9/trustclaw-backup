import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { setVoiceIdInput } from "./setVoiceId.schema";

export const setVoiceId = protectedProcedure
  .input(setVoiceIdInput)
  .mutation(async ({ ctx, input }) => {
    await db.composioClawInstance.update({
      where: { userId: ctx.session.user.id },
      data: { voiceId: input.voiceId },
    });
    return { ok: true as const };
  });
