import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";

export const clearVoiceApiKey = protectedProcedure.mutation(async ({ ctx }) => {
  // Missing instance (P2025) is fine — there's no key to clear. Anything else
  // (e.g. a transient DB failure) must surface, or the user is told the key
  // was removed while it's still stored.
  await db.composioClawInstance
    .updateMany({
      where: { userId: ctx.session.user.id },
      data: { voiceApiKey: null },
    });
  return { ok: true as const };
});
