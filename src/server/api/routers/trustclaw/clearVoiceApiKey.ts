import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";

export const clearVoiceApiKey = protectedProcedure.mutation(async ({ ctx }) => {
  await db.composioClawInstance
    .update({
      where: { userId: ctx.session.user.id },
      data: { voiceApiKey: null },
    })
    .catch(() => undefined);
  return { ok: true as const };
});
