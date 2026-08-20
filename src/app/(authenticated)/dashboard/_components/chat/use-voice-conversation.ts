"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { showErrorToast } from "~/components/core/toast-notifications";
import type {
  SpeechRecognitionConstructor,
  SpeechRecognitionInstance,
} from "./speech-recognition.types";

// Hands-free conversation loop, browser-native (no LiveKit): continuously
// listen -> on a pause, auto-send -> the agent answers -> TTS speaks it ->
// resume listening. STT is paused while thinking/speaking so the reply audio
// can't feed back into the mic (no true barge-in in this v1).
const SILENCE_MS = 1400; // pause after speech that triggers an auto-send
const STUCK_MS = 8_000; // coarse backstop if a turn never goes busy at all

export type ConversationPhase =
  | "off"
  | "listening"
  | "thinking"
  | "speaking"
  | "muted";

interface Options {
  onSend: (text: string) => void;
  isAwaitingReply: boolean; // chat status submitted/streaming
  isSpeaking: boolean; // TTS audio is playing
  isPreparing: boolean; // a reply is being curated/fetched for speech
}

function getCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function useVoiceConversation({
  onSend,
  isAwaitingReply,
  isSpeaking,
  isPreparing,
}: Options) {
  const ctorRef = useRef<SpeechRecognitionConstructor | null | undefined>(
    undefined,
  );
  if (ctorRef.current === undefined) ctorRef.current = getCtor();
  const isSupported = ctorRef.current !== null;

  const [phase, setPhase] = useState<ConversationPhase>("off");
  const phaseRef = useRef<ConversationPhase>("off");
  const setPhaseSafe = useCallback((p: ConversationPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // Muted = the call stays alive but the mic is paused. Distinct from End (tear
  // down) and the speaker toggle (output). mutedRef is read synchronously by the
  // driver effect; the state mirror drives the button.
  const [muted, setMutedState] = useState(false);
  const mutedRef = useRef(false);
  const setMuted = useCallback((m: boolean) => {
    mutedRef.current = m;
    setMutedState(m);
  }, []);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const transcriptRef = useRef("");
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Deferred-resume timer: scheduled when the loop looks idle, cancelled if it
  // goes busy again before the next tick - closes the 1-commit window between
  // the chat going idle and isPreparing flipping true (which would otherwise
  // blink the mic open every voiced turn).
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Invalidates an in-flight start() preflight (await getUserMedia) if the loop
  // is stopped/torn down before it resolves.
  const startTokenRef = useRef(0);
  const onSendRef = useRef(onSend);
  useEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);

  const clearSilence = useCallback(() => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
  }, []);

  const clearResume = useCallback(() => {
    if (resumeTimer.current) {
      clearTimeout(resumeTimer.current);
      resumeTimer.current = null;
    }
  }, []);

  const stopRecognition = useCallback(() => {
    clearSilence();
    const r = recognitionRef.current;
    recognitionRef.current = null;
    try {
      r?.abort();
    } catch {
      /* ignore */
    }
  }, [clearSilence]);

  // onresult needs flush before it's defined; route through a ref.
  const flushRef = useRef<() => void>(() => undefined);

  const startRecognition = useCallback(() => {
    if (!isSupported || !ctorRef.current || recognitionRef.current) return;
    const recognition = new ctorRef.current();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang =
      (typeof navigator !== "undefined" && navigator.language) || "en-US";
    recognition.maxAlternatives = 1;

    // Same re-delivery quirk as use-speech-dictation: several engines re-fire
    // already-final results on every event with resultIndex stuck at 0, so
    // slicing from resultIndex duplicated every finalized word into the
    // transcript once per event. Rebuild the full final text from index 0 and
    // accumulate only the not-yet-consumed suffix. The mark lives per
    // recognizer instance; the onend auto-restart is covered either way (a
    // results reset shows up as a non-extension and just resyncs).
    let consumedFinal = "";
    recognition.onresult = (event) => {
      let finalFull = "";
      let sawSpeech = false;
      for (const result of event.results) {
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalFull += transcript;
        else if (transcript.trim()) sawSpeech = true;
      }
      if (finalFull !== consumedFinal) {
        const chunk = finalFull.startsWith(consumedFinal)
          ? finalFull.slice(consumedFinal.length).trim()
          : "";
        consumedFinal = finalFull;
        if (chunk) {
          transcriptRef.current +=
            (transcriptRef.current ? " " : "") + chunk;
          sawSpeech = true;
        }
      }
      if (sawSpeech) {
        clearSilence();
        silenceTimer.current = setTimeout(() => flushRef.current(), SILENCE_MS);
      }
    };
    recognition.onerror = (event) => {
      const err = event.error;
      if (err === "not-allowed" || err === "service-not-allowed") {
        showErrorToast(
          "Microphone access denied - enable it in your browser settings.",
        );
        setPhaseSafe("off");
        stopRecognition();
      } else if (err === "audio-capture") {
        showErrorToast("No microphone found - ending hands-free.");
        setPhaseSafe("off");
        stopRecognition();
      }
      // no-speech / aborted / network are transient; onend restarts the
      // recognizer below while we're still listening.
    };
    recognition.onend = () => {
      // The engine stops itself periodically; restart while still listening.
      if (phaseRef.current === "listening" && recognitionRef.current) {
        try {
          recognition.start();
        } catch {
          /* ignore */
        }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      /* ignore */
    }
  }, [isSupported, clearSilence, setPhaseSafe, stopRecognition]);

  // The user paused: send what we heard and move to "thinking".
  const flush = useCallback(() => {
    clearSilence();
    const text = transcriptRef.current.trim();
    transcriptRef.current = "";
    if (!text) return;
    stopRecognition();
    setPhaseSafe("thinking");
    onSendRef.current(text);
  }, [clearSilence, stopRecognition, setPhaseSafe]);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // Drive the loop off the chat signals. A turn is "busy" while the agent
  // streams, while a reply is being prepared for speech, or while it's speaking.
  // We resume listening only once a turn has gone busy and then fully idle -
  // turnRanRef guards the brief window right after sending (before
  // isAwaitingReply flips true) so the mic can't reopen prematurely, and the
  // idle-resume (rather than a speaking-only edge) means tool-only replies, TTS
  // failures, chat errors, and muted voice all resume in well under a second
  // instead of dead-airing on the backstop timer.
  const turnRanRef = useRef(false);
  const busy = isAwaitingReply || isPreparing || isSpeaking;
  useEffect(() => {
    if (phaseRef.current === "off") return;
    if (busy) {
      // A pending resume from a momentary idle blip is now stale - cancel it.
      clearResume();
      turnRanRef.current = true;
      const target: ConversationPhase = isSpeaking ? "speaking" : "thinking";
      if (phaseRef.current !== target) {
        stopRecognition();
        setPhaseSafe(target);
      }
      return;
    }
    // Fully idle: resume listening, but only if a turn actually ran. Defer to a
    // macrotask so that the 1-commit gap between the chat going idle and
    // isPreparing flipping true (speak() sets it from inside an effect, one
    // commit later) re-asserts busy and cancels this before the mic opens. The
    // genuine resume paths (tool-only reply, TTS failure, muted voice) have no
    // such follow-up, so the timer fires and they resume within a tick.
    if (phaseRef.current === "listening" || phaseRef.current === "muted") return;
    if (turnRanRef.current && !resumeTimer.current) {
      resumeTimer.current = setTimeout(() => {
        resumeTimer.current = null;
        if (phaseRef.current === "off" || phaseRef.current === "listening") {
          return;
        }
        turnRanRef.current = false;
        // Muted: the turn finished but the user paused the mic - park in
        // "muted" instead of reopening it.
        if (mutedRef.current) {
          setPhaseSafe("muted");
          return;
        }
        setPhaseSafe("listening");
        startRecognition();
      }, 0);
    }
  }, [busy, isSpeaking, startRecognition, stopRecognition, setPhaseSafe, clearResume]);

  // Coarse backstop for anomalies only (e.g. a send that never starts streaming
  // so the loop never goes busy): if we sit in "thinking" while fully idle,
  // resume. Gated on !busy so it can NEVER fire mid-fetch and open the mic while
  // a reply is being prepared or spoken.
  useEffect(() => {
    if (phase !== "thinking" || busy) return;
    const t = setTimeout(() => {
      if (phaseRef.current === "thinking") {
        turnRanRef.current = false;
        if (mutedRef.current) {
          setPhaseSafe("muted");
          return;
        }
        setPhaseSafe("listening");
        startRecognition();
      }
    }, STUCK_MS);
    return () => clearTimeout(t);
  }, [phase, busy, startRecognition, setPhaseSafe]);

  const start = useCallback(async () => {
    if (!isSupported) {
      showErrorToast(
        "Hands-free voice needs a browser with speech support (Chrome or Edge).",
      );
      return;
    }
    const token = ++startTokenRef.current;
    // Desktop/Android: SpeechRecognition's implicit permission can silently
    // no-op (no prompt, no error), so force an explicit getUserMedia prompt.
    // iOS needs recognition.start() synchronous in the tap gesture, so skip the
    // awaited preflight there.
    const isIOS =
      typeof navigator !== "undefined" &&
      (/iP(hone|ad|od)/.test(navigator.userAgent) ||
        (navigator.userAgent.includes("Macintosh") &&
          navigator.maxTouchPoints > 1));
    if (
      !isIOS &&
      typeof navigator !== "undefined" &&
      navigator.mediaDevices?.getUserMedia
    ) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((t) => t.stop());
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        showErrorToast(
          name === "NotFoundError" || name === "DevicesNotFoundError"
            ? "No microphone found."
            : "Microphone blocked - allow it for this site, then try again.",
        );
        return;
      }
    }
    // The loop was stopped/torn down while the preflight was awaiting - abort.
    if (startTokenRef.current !== token) return;
    transcriptRef.current = "";
    setMuted(false);
    setPhaseSafe("listening");
    startRecognition();
  }, [isSupported, startRecognition, setPhaseSafe, setMuted]);

  const stop = useCallback(() => {
    startTokenRef.current++; // invalidate any in-flight start() preflight
    clearResume();
    stopRecognition();
    transcriptRef.current = "";
    turnRanRef.current = false;
    setMuted(false);
    setPhaseSafe("off");
  }, [stopRecognition, clearResume, setPhaseSafe, setMuted]);

  // Mute = pause the mic without ending the call. Unmute resumes listening when
  // idle (or after the current turn finishes, via the driver's resume branch).
  const toggleMute = useCallback(() => {
    if (mutedRef.current) {
      setMuted(false);
      if (phaseRef.current === "muted") {
        setPhaseSafe("listening");
        startRecognition();
      }
      // If still thinking/speaking, the driver resumes to listening on idle.
    } else {
      setMuted(true);
      clearResume();
      stopRecognition();
      if (phaseRef.current === "listening") setPhaseSafe("muted");
      // If thinking/speaking, the turn finishes then parks in "muted".
    }
  }, [setMuted, clearResume, stopRecognition, startRecognition, setPhaseSafe]);

  useEffect(() => {
    return () => {
      // Intentional: invalidate any in-flight start() preflight on unmount so it
      // can't setState / start a recognizer after teardown.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      startTokenRef.current++;
      clearResume();
      stopRecognition();
    };
  }, [stopRecognition, clearResume]);

  return {
    isSupported,
    phase,
    active: phase !== "off",
    muted,
    start,
    stop,
    toggleMute,
  };
}
