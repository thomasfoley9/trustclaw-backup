import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { decryptSecret } from "~/server/clients/crypto";

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
  const stored = instance?.composioApiKey ?? null;
  if (!stored) {
    return { hasKey: false, maskedKey: null };
  }

  // Decrypt only to build the masked preview. If it can't be decrypted
  // (missing/rotated key), still report a key exists but skip the preview.
  try {
    return { hasKey: true, maskedKey: mask(decryptSecret(stored)) };
  } catch {
    return { hasKey: true, maskedKey: null };
  }
});
