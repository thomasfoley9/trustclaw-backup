// Spoken-reply playback speed — a client-side preference (localStorage), applied
// as the <audio> element's playbackRate with pitch preserved. Synthesis params
// (voice, key) live server-side; playback rate is purely a listener preference,
// so it stays on the client and needs no re-synth.
const SPEED_KEY = "trustclaw-voice-speed";

export const VOICE_SPEEDS = [
  { value: 0.8, label: "0.8×" },
  { value: 1, label: "1×" },
  { value: 1.25, label: "1.25×" },
  { value: 1.5, label: "1.5×" },
  { value: 1.75, label: "1.75×" },
] as const;

const MIN_SPEED = 0.5;
const MAX_SPEED = 2;

export function getVoiceSpeed(): number {
  if (typeof window === "undefined") return 1;
  const raw = window.localStorage.getItem(SPEED_KEY);
  const n = raw ? Number(raw) : 1;
  return Number.isFinite(n) && n >= MIN_SPEED && n <= MAX_SPEED ? n : 1;
}

export function setVoiceSpeed(n: number): void {
  if (typeof window === "undefined") return;
  const clamped = Math.min(MAX_SPEED, Math.max(MIN_SPEED, n));
  window.localStorage.setItem(SPEED_KEY, String(clamped));
}

// Apply the saved speed to an <audio> element, preserving pitch so faster speech
// doesn't sound chipmunky.
export function applyVoiceSpeed(audio: HTMLAudioElement): void {
  audio.playbackRate = getVoiceSpeed();
  // preservesPitch is widely supported; guard for older engines.
  if ("preservesPitch" in audio) {
    (audio as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch =
      true;
  }
}
