"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { showErrorToast } from "~/components/core/toast-notifications";
import type {
  SpeechRecognitionConstructor,
  SpeechRecognitionErrorCode,
  SpeechRecognitionInstance,
} from "./speech-recognition.types";

function getCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

interface UseSpeechDictationOptions {
  // Called with each finalized chunk of speech.
  onFinal: (text: string) => void;
}

export function useSpeechDictation({ onFinal }: UseSpeechDictationOptions) {
  const ctorRef = useRef<SpeechRecognitionConstructor | null | undefined>(
    undefined,
  );
  if (ctorRef.current === undefined) ctorRef.current = getCtor();
  const isSupported = ctorRef.current !== null;

  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const listeningRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const handleError = useCallback((code: SpeechRecognitionErrorCode) => {
    switch (code) {
      case "not-allowed":
      case "service-not-allowed":
        showErrorToast(
          "Microphone access denied — enable it in your browser settings.",
        );
        break;
      case "audio-capture":
        showErrorToast("No microphone found.");
        break;
      case "network":
        showErrorToast("Speech service unreachable — check your connection.");
        break;
      case "no-speech":
      case "aborted":
        break; // benign / self-triggered
      default:
        showErrorToast("Dictation error — try again.");
    }
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(async () => {
    if (!isSupported || listeningRef.current || !ctorRef.current) return;

    // Force an explicit, visible mic-permission prompt with a clear error path.
    // SpeechRecognition's implicit permission can silently no-op (no prompt, no
    // error) when the permission state is ambiguous; getUserMedia never does.
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((t) => t.stop());
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          showErrorToast("No microphone found.");
        } else {
          showErrorToast(
            "Microphone blocked — allow it for this site in your browser's site settings, then try again.",
          );
        }
        return;
      }
    }

    const recognition = new ctorRef.current();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang =
      (typeof navigator !== "undefined" && navigator.language) || "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      listeningRef.current = true;
      setIsListening(true);
    };
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          const finalText = transcript.trim();
          if (finalText) onFinalRef.current(finalText);
        } else {
          interim += transcript;
        }
      }
      setInterimTranscript(interim);
    };
    const reset = () => {
      listeningRef.current = false;
      setIsListening(false);
      setInterimTranscript("");
    };
    recognition.onerror = (event) => {
      handleError(event.error);
      reset();
    };
    recognition.onend = reset;

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (error) {
      listeningRef.current = false;
      setIsListening(false);
      // Don't swallow — surface why nothing happened (e.g. InvalidStateError).
      showErrorToast(
        error instanceof Error && error.message
          ? `Couldn't start dictation: ${error.message}`
          : "Couldn't start voice dictation.",
      );
    }
  }, [isSupported, handleError]);

  const toggle = useCallback(() => {
    if (listeningRef.current) stop();
    else void start();
  }, [start, stop]);

  // Strict-Mode-safe teardown: abort drops pending results immediately.
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  return { isSupported, isListening, interimTranscript, start, stop, toggle };
}
