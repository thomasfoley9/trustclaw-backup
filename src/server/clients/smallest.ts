const SMALLEST_BASE = "https://waves-api.smallest.ai/api/v1";

// OpenAI GPT Realtime voices — MUST stay in sync with OPENAI_VOICES in
// claw-voice/src/agent.py (the worker maps unknown ids to its default).
export const CURATED_VOICES = [
  { id: "marin", label: "Marin — natural, expressive" },
  { id: "cedar", label: "Cedar — deep, natural" },
  { id: "ash", label: "Ash — clear, direct" },
  { id: "ballad", label: "Ballad — warm, expressive" },
  { id: "coral", label: "Coral — bright, conversational" },
  { id: "sage", label: "Sage — calm, measured" },
  { id: "alloy", label: "Alloy — balanced, neutral" },
  { id: "echo", label: "Echo — deep, resonant" },
  { id: "shimmer", label: "Shimmer — light, upbeat" },
  { id: "verse", label: "Verse — rich, articulate" },
] as const;

export const DEFAULT_VOICE_ID = "marin";

// The read-aloud path (/api/voice/tts) still synthesizes via Smallest, whose
// voice catalog is disjoint from the OpenAI ids the picker now stores. Any id
// Smallest doesn't know (an OpenAI id, or garbage) resolves to its default so
// read-aloud keeps working no matter what's in `voiceId`.
const SMALLEST_VOICES = new Set([
  "avery",
  "mia",
  "quinn",
  "christine",
  "sophia",
  "john",
  "ronald",
  "robert",
  "liam",
  "noah",
  "poppy",
]);
const SMALLEST_DEFAULT_VOICE = "avery";

export function resolveSmallestVoice(voiceId: string | null | undefined): string {
  return voiceId && SMALLEST_VOICES.has(voiceId)
    ? voiceId
    : SMALLEST_DEFAULT_VOICE;
}

export type SmallestKeyCheck = "ok" | "unauthorized" | "unreachable" | "error";

/** Free, read-only auth check (voice listing) — validates a key before storing. */
export async function checkSmallestKey(apiKey: string): Promise<SmallestKeyCheck> {
  let res: Response;
  try {
    res = await fetch(`${SMALLEST_BASE}/lightning-v3.1/get_voices`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return "unreachable";
  }
  if (res.status === 401 || res.status === 403) return "unauthorized";
  return res.ok ? "ok" : "error";
}

/**
 * Synthesize speech to MP3 bytes via Smallest Lightning v3.1. Returns native
 * MP3 (output_format: "mp3") so the browser can play it directly. Throws on
 * failure.
 */
export async function synthesizeSpeech(opts: {
  apiKey: string;
  voiceId: string;
  text: string;
}): Promise<ArrayBuffer> {
  const res = await fetch(`${SMALLEST_BASE}/lightning-v3.1/get_speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: opts.text,
      voice_id: opts.voiceId,
      sample_rate: 24000,
      output_format: "mp3",
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    throw new Error(`Smallest TTS returned ${res.status}`);
  }
  return res.arrayBuffer();
}
