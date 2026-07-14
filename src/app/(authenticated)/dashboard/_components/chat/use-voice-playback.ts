"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  showErrorToast,
  showInfoToast,
} from "~/components/core/toast-notifications";
import { applyVoiceSpeed } from "./voice-speed";

const STORAGE_KEY = "trustclaw-voice-enabled";
// A 0-sample silent WAV. Played inside a user gesture to "unlock" the audio
// element on mobile/Safari, so later programmatic playback (after a reply, not
// a gesture) is allowed by the browser's autoplay policy.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
// The /api/voice/tts route caps text at 5000 chars - trim with margin.
const MAX_TTS_CHARS = 4800;

// Short spoken fallback used when the brief route is unreachable - never read
// the whole on-screen reply aloud. Strips light markdown, ~first sentence.
function shortSpoken(text: string): string {
  const t = text
    .replace(/[*_`#>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const sentence = /^.*?[.!?](\s|$)/.exec(t)?.[0]?.trim() ?? t;
  return sentence.length > 180 ? `${sentence.slice(0, 180).trim()}…` : sentence;
}

// POST with a small retry on 5xx / network errors - the voice routes are
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
      // network error - fall through to retry
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
  // True from the moment a reply is requested until audio actually starts (or
  // the attempt fails). Lets the conversation loop distinguish "about to speak"
  // from "will never speak" so it neither reopens the mic mid-fetch nor stalls.
  const [isPreparing, setIsPreparing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const enabledRef = useRef(false);
  // Monotonic token: bumped on each speak() and on stop(). An in-flight speak()
  // whose token is superseded bails after each await instead of clobbering the
  // current call's audio or reviving cancelled/orphaned playback.
  const genRef = useRef(0);
  // Autoplay-blocked recovery: when play() throws NotAllowedError (voice was
  // persisted-on across a reload, so no gesture has unlocked the element yet),
  // the utterance is kept and replayed inside the NEXT user gesture instead of
  // being dropped silently. Holds the one-time gesture handler so it can be
  // detached on stop/unmount.
  const pendingGestureRetryRef = useRef<(() => void) | null>(null);
  // The "tap to enable audio" hint should show once, not per blocked reply.
  const autoplayHintShownRef = useRef(false);

  const clearPendingGestureRetry = useCallback(() => {
    const handler = pendingGestureRetryRef.current;
    if (!handler) return;
    pendingGestureRetryRef.current = null;
    document.removeEventListener("pointerdown", handler);
    document.removeEventListener("keydown", handler);
  }, []);

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
    genRef.current++; // invalidate any in-flight speak()
    clearPendingGestureRetry(); // a stopped utterance must not replay later
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
    }
    revoke();
    setIsSpeaking(false);
    setIsPreparing(false);
  }, [revoke, clearPendingGestureRetry]);

  // Prime the <audio> element inside a user gesture so a later (non-gesture)
  // reply is allowed to autoplay. Called on every send - handles the case where
  // voice is persisted-on across reloads with no fresh toggle gesture.
  const unlock = useCallback(() => {
    if (!enabledRef.current) return;
    const audio = ensureAudio();
    if (!audio.paused) return; // a real reply is playing - don't interrupt it
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

      const myGen = ++genRef.current;
      setIsPreparing(true);
      const audio = ensureAudio();
      audio.pause();
      revoke();

      try {
        // 1) Curate the reply into a short spoken brief (the EA layer) - voice
        // speaks this, not the full on-screen digest. Default to a short spoken
        // version so an unreachable brief route never reads the whole reply.
        let toSpeak = shortSpoken(clean);
        const briefRes = await postRetry(
          "/api/voice/brief",
          JSON.stringify({ text: clean }),
        );
        if (genRef.current !== myGen) return; // superseded / cancelled
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
        if (genRef.current !== myGen) return; // superseded / cancelled
        if (!res) {
          setIsPreparing(false);
          showErrorToast("Voice service is busy - try again in a moment.");
          return;
        }
        if (!res.ok) {
          setIsPreparing(false);
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
        if (genRef.current !== myGen) return; // superseded / cancelled
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
        setIsPreparing(false);
        applyVoiceSpeed(audio);
        setIsSpeaking(true);
        await audio.play();
      } catch (err) {
        // Don't clobber a newer/superseding call's state.
        if (genRef.current !== myGen) return;
        setIsPreparing(false);
        setIsSpeaking(false);
        // Autoplay blocked (no unlocking gesture yet - e.g. a resumed stream
        // finishing right after a reload). Keep the loaded clip and replay it
        // inside the next gesture, which browsers always allow.
        if (
          err instanceof Error &&
          err.name === "NotAllowedError" &&
          urlRef.current
        ) {
          if (!autoplayHintShownRef.current) {
            autoplayHintShownRef.current = true;
            showInfoToast(
              "Tap anywhere to enable audio, then replies will be spoken.",
            );
          }
          clearPendingGestureRetry();
          const retry = () => {
            clearPendingGestureRetry();
            if (genRef.current !== myGen) return; // superseded / stopped
            setIsSpeaking(true);
            audio.play().catch(() => {
              if (genRef.current !== myGen) return;
              setIsSpeaking(false);
              revoke();
            });
          };
          pendingGestureRetryRef.current = retry;
          document.addEventListener("pointerdown", retry);
          document.addEventListener("keydown", retry);
          return;
        }
        revoke();
      }
    },
    [ensureAudio, persist, revoke, clearPendingGestureRetry],
  );

  useEffect(() => {
    return () => {
      clearPendingGestureRetry();
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [clearPendingGestureRetry]);

  return { enabled, isSpeaking, isPreparing, toggle, speak, stop, unlock };
}
