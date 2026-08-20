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

import { useSpeechDictation } from "./use-speech-dictation";

// Minimal fake engine. Tests drive onresult with hand-built event sequences
// that reproduce real engines' behavior, including the buggy ones.
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  started = false;
  onresult: ((event: SpeechRecognitionEvent) => void) | null = null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;

  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started = true;
    this.onstart?.();
  }
  stop() {
    this.started = false;
    this.onend?.();
  }
  abort() {
    this.started = false;
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

async function startDictation(onFinal: (text: string) => void) {
  const hook = renderHook(() => useSpeechDictation({ onFinal }));
  await act(async () => {
    await hook.result.current.start();
  });
  const rec = FakeRecognition.instances[FakeRecognition.instances.length - 1]!;
  return { hook, rec };
}

describe("useSpeechDictation", () => {
  beforeEach(() => {
    FakeRecognition.instances = [];
    window.SpeechRecognition =
      FakeRecognition as unknown as typeof window.SpeechRecognition;
  });
  afterEach(() => {
    delete window.SpeechRecognition;
    vi.restoreAllMocks();
  });

  it("delivers each final chunk once with spec-compliant resultIndex events", async () => {
    const onFinal = vi.fn();
    const { rec } = await startDictation(onFinal);

    act(() => {
      rec.emit([res("hello ", false)], 0);
      rec.emit([res("hello there", true)], 0);
      rec.emit([res("hello there", true), res("general ", false)], 1);
      rec.emit([res("hello there", true), res("general kenobi", true)], 1);
    });

    expect(onFinal.mock.calls).toEqual([["hello there"], ["general kenobi"]]);
  });

  it("does not repeat a final that buggy engines re-deliver on every event (the 80x bug)", async () => {
    const onFinal = vi.fn();
    const { rec } = await startDictation(onFinal);

    // Safari / Chrome-on-Android behavior: resultIndex stuck at 0 and the
    // already-final result re-fired with every subsequent event. Continuous
    // mode produces one event per interim update, so this loop mirrors what a
    // few seconds of speech actually delivers.
    act(() => {
      rec.emit([res("hello", true)], 0);
      for (let i = 0; i < 80; i++) {
        rec.emit([res("hello", true), res("wor", false)], 0);
      }
    });

    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenCalledWith("hello");
  });

  it("delivers only the new suffix when a final result grows in place", async () => {
    const onFinal = vi.fn();
    const { rec } = await startDictation(onFinal);

    act(() => {
      rec.emit([res("hello", true)], 0);
      rec.emit([res("hello world", true)], 0);
    });

    expect(onFinal.mock.calls).toEqual([["hello"], ["world"]]);
  });

  it("resyncs without re-delivering when an engine revises a final in place", async () => {
    const onFinal = vi.fn();
    const { rec } = await startDictation(onFinal);

    act(() => {
      rec.emit([res("hello", true)], 0);
      // Non-extension revision (recognition corrected itself).
      rec.emit([res("yellow", true)], 0);
      // Growth continues from the revised text.
      rec.emit([res("yellow sun", true)], 0);
    });

    expect(onFinal.mock.calls).toEqual([["hello"], ["sun"]]);
  });

  it("interim results update interimTranscript without firing onFinal", async () => {
    const onFinal = vi.fn();
    const { hook, rec } = await startDictation(onFinal);

    act(() => {
      rec.emit([res("typing a", false)], 0);
    });

    expect(onFinal).not.toHaveBeenCalled();
    expect(hook.result.current.interimTranscript).toBe("typing a");
  });

  it("a double-tap can only ever spawn one recognizer", async () => {
    const onFinal = vi.fn();
    const hook = renderHook(() => useSpeechDictation({ onFinal }));

    await act(async () => {
      // Both calls enter before any onstart fires - the old async guard let
      // this create two live engines, the first of them unstoppable.
      await Promise.all([
        hook.result.current.start(),
        hook.result.current.start(),
      ]);
    });

    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it("toggling off during the permission preflight aborts the pending start", async () => {
    const onFinal = vi.fn();
    let releasePreflight: (() => void) | undefined;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () =>
          new Promise<{ getTracks: () => [] }>((resolve) => {
            releasePreflight = () => resolve({ getTracks: () => [] });
          }),
      },
    });

    try {
      const hook = renderHook(() => useSpeechDictation({ onFinal }));
      let pending: Promise<void> | undefined;
      act(() => {
        pending = hook.result.current.start();
      });
      act(() => {
        hook.result.current.stop();
      });
      await act(async () => {
        releasePreflight?.();
        await pending;
      });

      expect(FakeRecognition.instances).toHaveLength(0);
    } finally {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: undefined,
      });
    }
  });
});
