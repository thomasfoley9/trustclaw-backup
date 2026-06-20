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
const STUCK_MS = 20_000; // resume listening if a turn never produces speech

export type ConversationPhase = "off" | "listening" | "thinking" | "speaking";

interface Options {
  onSend: (text: string) => void;
  isAwaitingReply: boolean; // chat status submitted/streaming
  isSpeaking: boolean; // TTS is speaking the reply
}

function getCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function useVoiceConversation({
  onSend,
  isAwaitingReply,
  isSpeaking,
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
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        showErrorToast(
          "Microphone access denied — enable it in your browser settings.",
        );
        setPhaseSafe("off");
        stopRecognition();
      }
      // no-speech / aborted are benign; onend keeps the loop alive.
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

  // Drive the loop off the chat signals. Resume listening only off the
  // speaking->idle edge, so the brief window after sending (before
  // isAwaitingReply flips true) can't re-open the mic prematurely.
  useEffect(() => {
    if (phaseRef.current === "off") return;
    if (isAwaitingReply) {
      if (phaseRef.current !== "thinking") {
        stopRecognition();
        setPhaseSafe("thinking");
      }
    } else if (isSpeaking) {
      if (phaseRef.current !== "speaking") {
        stopRecognition();
        setPhaseSafe("speaking");
      }
    } else if (phaseRef.current === "speaking") {
      setPhaseSafe("listening");
      startRecognition();
    }
  }, [isAwaitingReply, isSpeaking, startRecognition, stopRecognition, setPhaseSafe]);

  // Safety net: a turn that never speaks (empty reply / TTS failure) would leave
  // us stuck in "thinking" — resume listening after a timeout.
  useEffect(() => {
    if (phase !== "thinking") return;
    const t = setTimeout(() => {
      if (phaseRef.current === "thinking") {
        setPhaseSafe("listening");
        startRecognition();
      }
    }, STUCK_MS);
    return () => clearTimeout(t);
  }, [phase, startRecognition, setPhaseSafe]);

  const start = useCallback(() => {
    if (!isSupported) {
      showErrorToast(
        "Hands-free voice needs a browser with speech support (Chrome or Edge).",
      );
      return;
    }
    transcriptRef.current = "";
    setPhaseSafe("listening");
    startRecognition();
  }, [isSupported, startRecognition, setPhaseSafe]);

  const stop = useCallback(() => {
    stopRecognition();
    transcriptRef.current = "";
    setPhaseSafe("off");
  }, [stopRecognition, setPhaseSafe]);

  useEffect(() => {
    return () => stopRecognition();
  }, [stopRecognition]);

  return { isSupported, phase, active: phase !== "off", start, stop };
}
