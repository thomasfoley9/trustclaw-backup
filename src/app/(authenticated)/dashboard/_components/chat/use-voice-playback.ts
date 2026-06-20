"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { showErrorToast } from "~/components/core/toast-notifications";

const STORAGE_KEY = "trustclaw-voice-enabled";
// A 0-sample silent WAV. Played inside the toggle's click gesture to "unlock"
// the audio element on mobile, so later programmatic playback (after a stream
// finishes — not a user gesture) is allowed by iOS/Android.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
// The /api/voice/tts route caps text at 5000 chars — trim with margin.
const MAX_TTS_CHARS = 4800;

// Speaks the assistant's replies aloud via the user's Smallest.ai key. One
// reused <audio> element keeps the mobile unlock alive and guarantees only one
// utterance plays at a time.
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
        try {
          const br = await fetch("/api/voice/brief", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: clean }),
          });
          if (br.ok) {
            const data = (await br.json()) as { brief?: string };
            if (typeof data.brief === "string" && data.brief.trim()) {
              toSpeak = data.brief.trim();
            }
          }
        } catch {
          // keep the full reply text
        }

        // 2) Speak the brief.
        const res = await fetch("/api/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: toSpeak.slice(0, MAX_TTS_CHARS) }),
        });
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

  return { enabled, isSpeaking, toggle, speak, stop };
}
