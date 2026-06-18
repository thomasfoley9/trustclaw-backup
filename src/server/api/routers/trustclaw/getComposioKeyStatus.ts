import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";

function mask(key: string): string {
  if (key.length <= 10) return "•".repeat(key.length);
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export const getComposioKeyStatus = protectedProcedure.query(async ({ ctx }) => {
  const userId = ctx.session.user.id;
  const instance = await db.composioClawInstance.findUnique({
    where: { userId },
    select: { composioApiKey: true },
  });
  const key = instance?.composioApiKey ?? null;
  return {
    hasKey: !!key,
    maskedKey: key ? mask(key) : null,
  };
});
