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
  // Invalidates an in-flight start() preflight (await getUserMedia) if the
  // user toggles off before it resolves - otherwise the recognizer starts
  // anyway with nothing pointing at it.
  const startTokenRef = useRef(0);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const handleError = useCallback((code: SpeechRecognitionErrorCode) => {
    switch (code) {
      case "not-allowed":
      case "service-not-allowed":
        showErrorToast(
          "Microphone access denied - enable it in your browser settings.",
        );
        break;
      case "audio-capture":
        showErrorToast("No microphone found.");
        break;
      case "network":
        showErrorToast("Speech service unreachable - check your connection.");
        break;
      case "no-speech":
      case "aborted":
        break; // benign / self-triggered
      default:
        showErrorToast("Dictation error - try again.");
    }
  }, []);

  const stop = useCallback(() => {
    startTokenRef.current++; // cancel a start() still in its preflight
    listeningRef.current = false;
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(async () => {
    if (!isSupported || listeningRef.current || !ctorRef.current) return;
    // Claim the slot SYNCHRONOUSLY. The old guard only flipped in onstart
    // (async, after engine spin-up) and start() awaits a permission preflight
    // first - so a double-tap spawned two live recognizers, both appending
    // transcripts, and stop() could only ever reach the newest one.
    listeningRef.current = true;
    const token = ++startTokenRef.current;

    // Desktop + Android: SpeechRecognition's implicit permission can silently
    // no-op (no prompt, no error), so force an explicit getUserMedia prompt with
    // a clear error path. iOS Safari is the exception - it requires
    // recognition.start() to run synchronously inside the tap gesture, and an
    // awaited preflight drops that user-activation, so on iOS we skip the
    // preflight and let the engine raise its own permission prompt.
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
        listeningRef.current = false;
        const name = err instanceof Error ? err.name : "";
        if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          showErrorToast("No microphone found.");
        } else {
          showErrorToast(
            "Microphone blocked - allow it for this site in your browser's site settings, then try again.",
          );
        }
        return;
      }
    }

    // Toggled off (or unmounted) while the preflight was awaiting - abort.
    if (startTokenRef.current !== token) return;

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
    // High-water mark of final text already handed to onFinal, per recognizer.
    // Several engines (Safari, Chrome on Android, desktop Chrome in continuous
    // mode) re-deliver ALREADY-FINAL results on every subsequent event with
    // resultIndex stuck at 0 - and continuous mode fires an event per interim
    // update, many per second. Slicing from resultIndex and appending each
    // isFinal chunk therefore re-typed every finalized word once per event
    // (the "same word 80 times" bug). Instead, rebuild the full final
    // transcript from index 0 on every event and deliver only the suffix that
    // hasn't been delivered yet.
    let deliveredFinal = "";
    recognition.onresult = (event) => {
      let finalFull = "";
      let interim = "";
      for (const result of event.results) {
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalFull += transcript;
        else interim += transcript;
      }
      if (finalFull !== deliveredFinal) {
        // An engine may also revise an earlier final in place. Extension
        // delivers the new suffix; a non-extension revision resyncs the mark
        // without re-delivering (better to miss a correction than repeat).
        const chunk = finalFull.startsWith(deliveredFinal)
          ? finalFull.slice(deliveredFinal.length).trim()
          : "";
        deliveredFinal = finalFull;
        if (chunk) onFinalRef.current(chunk);
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
      // Don't swallow - surface why nothing happened (e.g. InvalidStateError).
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

  // Strict-Mode-safe teardown: abort drops pending results immediately, and
  // the token bump cancels a start() still awaiting its permission preflight.
  useEffect(() => {
    return () => {
      // Intentional: invalidate any in-flight start() preflight on unmount so
      // it can't start a recognizer after teardown.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      startTokenRef.current++;
      listeningRef.current = false;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  return { isSupported, isListening, interimTranscript, start, stop, toggle };
}
