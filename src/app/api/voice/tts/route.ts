import { auth } from "~/server/auth";
import { db } from "~/server/clients/db";
import { decryptSecret } from "~/server/clients/crypto";
import { synthesizeSpeech, DEFAULT_VOICE_ID } from "~/server/clients/smallest";
import { env } from "~/env";

export const maxDuration = 30;

// Synthesizes text -> MP3 via the caller's Smallest.ai key (decrypted
// server-side, never exposed to the client). The browser plays the returned
// audio/mpeg bytes directly.
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    text?: unknown;
  } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return new Response("Empty text", { status: 400 });
  }
  if (text.length > 5000) {
    return new Response("Text too long", { status: 413 });
  }

  const instance = await db.composioClawInstance.findUnique({
    where: { userId: session.user.id },
    select: { voiceApiKey: true, voiceId: true },
  });

  // A per-user (BYO) key wins; otherwise fall back to the shared owner-funded
  // Smallest key so every user gets voice without signing up for one.
  let apiKey: string | null = null;
  if (instance?.voiceApiKey) {
    try {
      apiKey = decryptSecret(instance.voiceApiKey);
    } catch {
      return new Response("Voice key could not be decrypted", { status: 500 });
    }
  } else if (env.SMALLEST_API_KEY) {
    apiKey = env.SMALLEST_API_KEY;
  }
  if (!apiKey) {
    return new Response("No voice key set", { status: 412 });
  }

  const voiceId = instance?.voiceId ?? DEFAULT_VOICE_ID;

  try {
    const audio = await synthesizeSpeech({
      apiKey,
      voiceId,
      text,
    });
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("TTS failed", { status: 502 });
  }
}
