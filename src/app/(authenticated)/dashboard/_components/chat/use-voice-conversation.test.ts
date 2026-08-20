// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SpeechRecognitionEvent,
  SpeechRecognitionErrorEvent,
  SpeechRecognitionResult,
} from "./speech-recognition.types";

vi.mock("~/components/core/toast-notifications", () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  trpcToastOnError: vi.fn(),
  showTrpcErrorToast: vi.fn(),
}));

import { useVoiceConversation } from "./use-voice-conversation";

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((event: SpeechRecognitionEvent) => void) | null = null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;

  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.onstart?.();
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
  emit(results: SpeechRecognitionResult[], resultIndex = 0) {
    this.onresult?.({
      resultIndex,
      results: results as unknown as SpeechRecognitionEvent["results"],
    } as SpeechRecognitionEvent);
  }
}

function res(transcript: string, isFinal: boolean): SpeechRecognitionResult {
  return {
    isFinal,
    length: 1,
    0: { transcript, confidence: 1 },
  } as SpeechRecognitionResult;
}

describe("useVoiceConversation transcript accumulation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeRecognition.instances = [];
    window.SpeechRecognition =
      FakeRecognition as unknown as typeof window.SpeechRecognition;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete window.SpeechRecognition;
    vi.restoreAllMocks();
  });

  it("auto-sends the deduped transcript even when the engine re-delivers finals", async () => {
    const onSend = vi.fn();
    const hook = renderHook(() =>
      useVoiceConversation({
        onSend,
        isAwaitingReply: false,
        isSpeaking: false,
        isPreparing: false,
      }),
    );

    await act(async () => {
      await hook.result.current.start();
    });
    const rec =
      FakeRecognition.instances[FakeRecognition.instances.length - 1]!;

    act(() => {
      rec.emit([res("send the", true)], 0);
      // Buggy re-delivery: the same final repeated across many events while
      // the next words come in as interim then final, resultIndex stuck at 0.
      for (let i = 0; i < 40; i++) {
        rec.emit([res("send the", true), res("rep", false)], 0);
      }
      rec.emit([res("send the", true), res("report", true)], 0);
    });

    // The user pauses; the silence timer flushes and auto-sends.
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("send the report");
  });
});
