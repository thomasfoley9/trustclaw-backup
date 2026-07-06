import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { decryptSecret } from "~/server/clients/crypto";
import { isSharedComposioAvailable } from "~/server/clients/composio";

function mask(key: string): string {
  if (key.length <= 10) return "•".repeat(key.length);
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

// hasKey = "tools are available for this user" (the activation gates key off
// it): either their own key or the owner-funded shared platform key. byoKey
// distinguishes the two for the Settings card.
export const getComposioKeyStatus = protectedProcedure.query(async ({ ctx }) => {
  const userId = ctx.session.user.id;
  const instance = await db.composioClawInstance.findUnique({
    where: { userId },
    select: { composioApiKey: true },
  });
  const stored = instance?.composioApiKey ?? null;
  const shared = isSharedComposioAvailable();
  if (!stored) {
    return { hasKey: shared, byoKey: false, shared, maskedKey: null };
  }

  // Decrypt only to build the masked preview. If it can't be decrypted
  // (missing/rotated key), still report a key exists but skip the preview.
  try {
    return {
      hasKey: true,
      byoKey: true,
      shared: false,
      maskedKey: mask(decryptSecret(stored)),
    };
  } catch {
    return { hasKey: true, byoKey: true, shared: false, maskedKey: null };
  }
});
