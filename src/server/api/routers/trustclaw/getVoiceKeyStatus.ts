import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { decryptSecret } from "~/server/clients/crypto";
import { CURATED_VOICES, DEFAULT_VOICE_ID } from "~/server/clients/smallest";

function mask(key: string): string {
  if (key.length <= 12) return "•".repeat(key.length);
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

export const getVoiceKeyStatus = protectedProcedure.query(async ({ ctx }) => {
  const userId = ctx.session.user.id;
  const instance = await db.composioClawInstance.findUnique({
    where: { userId },
    select: { voiceApiKey: true, voiceId: true },
  });

  const voices = CURATED_VOICES.map((v) => ({ id: v.id, label: v.label }));
  // Report the EFFECTIVE voice: a stored id the catalog no longer carries
  // (e.g. a legacy Smallest id) resolves to the default, matching what the
  // realtime worker actually speaks with - so the picker highlights reality.
  const storedVoice = instance?.voiceId;
  const voiceId =
    storedVoice && CURATED_VOICES.some((v) => v.id === storedVoice)
      ? storedVoice
      : DEFAULT_VOICE_ID;
  const stored = instance?.voiceApiKey ?? null;

  if (!stored) {
    return { hasKey: false, maskedKey: null, voiceId, voices };
  }
  try {
    return { hasKey: true, maskedKey: mask(decryptSecret(stored)), voiceId, voices };
  } catch {
    return { hasKey: true, maskedKey: null, voiceId, voices };
  }
});
