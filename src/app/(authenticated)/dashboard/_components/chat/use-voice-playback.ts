"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { showErrorToast } from "~/components/core/toast-notifications";

const STORAGE_KEY = "trustclaw-voice-enabled";
// A 0-sample silent WAV. Played inside a user gesture to "unlock" the audio
// element on mobile/Safari, so later programmatic playback (after a reply, not
// a gesture) is allowed by the browser's autoplay policy.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
// The /api/voice/tts route caps text at 5000 chars — trim with margin.
const MAX_TTS_CHARS = 4800;

// POST with a small retry on 5xx / network errors — the voice routes are
// serverless and can cold-start 503 like the rest of the API. Null if all fail.
async function postRetry(url: string, body: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (res.ok || res.status < 500) return res;
    } catch {
      // network error — fall through to retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return null;
}

// Speaks the assistant's replies aloud via the user's/owner's Smallest.ai key.
// One reused <audio> element keeps the mobile unlock alive and guarantees only
// one utterance plays at a time.
export function useVoicePlayback() {
  const [enabled, setEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const enabledRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY) === "1") setEnabled(true);
  }, []);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const ensureAudio = useCallback((): HTMLAudioElement => {
    audioRef.current ??= new Audio();
    return audioRef.current;
  }, []);

  const revoke = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const persist = useCallback((on: boolean) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
    }
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
    }
    revoke();
    setIsSpeaking(false);
  }, [revoke]);

  // Prime the <audio> element inside a user gesture so a later (non-gesture)
  // reply is allowed to autoplay. Called on every send — handles the case where
  // voice is persisted-on across reloads with no fresh toggle gesture.
  const unlock = useCallback(() => {
    if (!enabledRef.current) return;
    const audio = ensureAudio();
    if (!audio.paused) return; // a real reply is playing — don't interrupt it
    try {
      audio.src = SILENT_WAV;
      void audio.play().catch(() => undefined);
    } catch {
      // ignore
    }
  }, [ensureAudio]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      persist(next);
      if (next) {
        // Unlock audio within this click gesture so later replies can autoplay.
        const audio = ensureAudio();
        audio.src = SILENT_WAV;
        void audio.play().catch(() => undefined);
      } else {
        stop();
      }
      return next;
    });
  }, [ensureAudio, persist, stop]);

  const speak = useCallback(
    async (text: string) => {
      if (!enabledRef.current) return;
      const clean = text.trim();
      if (!clean) return;

      const audio = ensureAudio();
      audio.pause();
      revoke();

      try {
        // 1) Curate the reply into a short spoken brief (the EA layer) — voice
        // speaks this, not the full on-screen digest. Falls back to the reply.
        let toSpeak = clean;
        const briefRes = await postRetry(
          "/api/voice/brief",
          JSON.stringify({ text: clean }),
        );
        if (briefRes?.ok) {
          const data = (await briefRes.json()) as { brief?: string };
          if (typeof data.brief === "string" && data.brief.trim()) {
            toSpeak = data.brief.trim();
          }
        }

        // 2) Speak the brief.
        const res = await postRetry(
          "/api/voice/tts",
          JSON.stringify({ text: toSpeak.slice(0, MAX_TTS_CHARS) }),
        );
        if (!res) {
          showErrorToast("Voice service is busy — try again in a moment.");
          return;
        }
        if (!res.ok) {
          if (res.status === 412) {
            showErrorToast(
              "Add your Smallest.ai key in Settings → Voice to hear replies.",
            );
            persist(false);
            setEnabled(false);
          } else {
            showErrorToast("Voice playback failed.");
          }
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        audio.src = url;
        audio.onended = () => {
          setIsSpeaking(false);
          revoke();
        };
        audio.onerror = () => {
          setIsSpeaking(false);
          revoke();
        };
        setIsSpeaking(true);
        await audio.play();
      } catch {
        setIsSpeaking(false);
        revoke();
      }
    },
    [ensureAudio, persist, revoke],
  );

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  return { enabled, isSpeaking, toggle, speak, stop, unlock };
}
