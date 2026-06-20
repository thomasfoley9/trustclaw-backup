const SMALLEST_BASE = "https://waves-api.smallest.ai/api/v1";

// Curated English voices from Smallest's lightning-v3.1 catalog (241 total).
export const CURATED_VOICES = [
  { id: "avery", label: "Avery — American, female" },
  { id: "mia", label: "Mia — American, female" },
  { id: "quinn", label: "Quinn — American, female" },
  { id: "christine", label: "Christine — American, female" },
  { id: "sophia", label: "Sophia — American, female" },
  { id: "john", label: "John — American, male" },
  { id: "ronald", label: "Ronald — American, male" },
  { id: "robert", label: "Robert — American, male" },
  { id: "liam", label: "Liam — British, male" },
  { id: "noah", label: "Noah — British, male" },
  { id: "poppy", label: "Poppy — British, female" },
] as const;

export const DEFAULT_VOICE_ID = "avery";

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
