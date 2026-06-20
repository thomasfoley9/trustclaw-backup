import { auth } from "~/server/auth";
import { db } from "~/server/clients/db";
import { decryptSecret } from "~/server/clients/crypto";
import { synthesizeSpeech } from "~/server/clients/smallest";

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
  if (!instance?.voiceApiKey) {
    return new Response("No voice key set", { status: 412 });
  }

  let apiKey: string;
  try {
    apiKey = decryptSecret(instance.voiceApiKey);
  } catch {
    return new Response("Voice key could not be decrypted", { status: 500 });
  }

  try {
    const audio = await synthesizeSpeech({
      apiKey,
      voiceId: instance.voiceId,
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
