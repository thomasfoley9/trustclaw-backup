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

export type ConversationPhase = "off" | "listening" | "thinking" | "speaking";

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

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const transcriptRef = useRef("");
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

    recognition.onresult = (event) => {
      let sawSpeech = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          const finalText = transcript.trim();
          if (finalText) {
            transcriptRef.current +=
              (transcriptRef.current ? " " : "") + finalText;
            sawSpeech = true;
          }
        } else if (transcript.trim()) {
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
          "Microphone access denied — enable it in your browser settings.",
        );
        setPhaseSafe("off");
        stopRecognition();
      } else if (err === "audio-capture") {
        showErrorToast("No microphone found — ending hands-free.");
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
  // We resume listening only once a turn has gone busy and then fully idle —
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
      turnRanRef.current = true;
      const target: ConversationPhase = isSpeaking ? "speaking" : "thinking";
      if (phaseRef.current !== target) {
        stopRecognition();
        setPhaseSafe(target);
      }
      return;
    }
    // Fully idle: resume listening, but only if a turn actually ran.
    if (phaseRef.current === "listening") return;
    if (turnRanRef.current) {
      turnRanRef.current = false;
      setPhaseSafe("listening");
      startRecognition();
    }
  }, [busy, isSpeaking, startRecognition, stopRecognition, setPhaseSafe]);

  // Coarse backstop for anomalies only (e.g. a send that never starts streaming
  // so the loop never goes busy): if we sit in "thinking" while fully idle,
  // resume. Gated on !busy so it can NEVER fire mid-fetch and open the mic while
  // a reply is being prepared or spoken.
  useEffect(() => {
    if (phase !== "thinking" || busy) return;
    const t = setTimeout(() => {
      if (phaseRef.current === "thinking") {
        turnRanRef.current = false;
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
            : "Microphone blocked — allow it for this site, then try again.",
        );
        return;
      }
    }
    transcriptRef.current = "";
    setPhaseSafe("listening");
    startRecognition();
  }, [isSupported, startRecognition, setPhaseSafe]);

  const stop = useCallback(() => {
    stopRecognition();
    transcriptRef.current = "";
    turnRanRef.current = false;
    setPhaseSafe("off");
  }, [stopRecognition, setPhaseSafe]);

  useEffect(() => {
    return () => stopRecognition();
  }, [stopRecognition]);

  return { isSupported, phase, active: phase !== "off", start, stop };
}
