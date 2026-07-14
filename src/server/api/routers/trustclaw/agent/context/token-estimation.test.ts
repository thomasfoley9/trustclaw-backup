import { describe, expect, it } from "vitest";
import type { ReconstructedMessage } from "../types";
import {
  DEFAULT_COMPACTION_SETTINGS,
  calculateContextTokens,
  estimateContextTokens,
  estimateMessageTokens,
  shouldCompact,
  shouldFlushMemory,
  type CompactionSettings,
} from "./token-estimation";

const SETTINGS: CompactionSettings = {
  contextWindow: 100_000,
  ...DEFAULT_COMPACTION_SETTINGS, // reserveTokens 20k, keepRecentTokens 20k
};

describe("estimateMessageTokens", () => {
  it("estimates a string user message at chars/4, rounded up", () => {
    const msg: ReconstructedMessage = { role: "user", content: "x".repeat(401) };
    expect(estimateMessageTokens(msg)).toBe(101); // ceil(401 / 4)
  });

  it("estimates a string assistant message at chars/4", () => {
    const msg: ReconstructedMessage = {
      role: "assistant",
      content: "y".repeat(800),
    };
    expect(estimateMessageTokens(msg)).toBe(200);
  });

  it("sums text and tool-call parts of an assistant message", () => {
    const input = { query: "weather in SF" };
    const msg: ReconstructedMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "t".repeat(100) },
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "search", // 6 chars
          input,
        },
      ],
    };
    const expectedChars = 100 + JSON.stringify(input).length + "search".length;
    expect(estimateMessageTokens(msg)).toBe(Math.ceil(expectedChars / 4));
  });

  it("sums tool-result outputs plus tool names for tool messages", () => {
    const output = { type: "text" as const, value: "v".repeat(50) };
    const msg: ReconstructedMessage = {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "memory_search", // 13 chars
          output,
        },
      ],
    };
    const expectedChars = JSON.stringify(output).length + 13;
    expect(estimateMessageTokens(msg)).toBe(Math.ceil(expectedChars / 4));
  });
});

describe("calculateContextTokens", () => {
  it("prefers totalTokens when present", () => {
    expect(
      calculateContextTokens({
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 42,
      }),
    ).toBe(42);
  });

  it("falls back to input + output when totalTokens is 0", () => {
    expect(
      calculateContextTokens({
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 0,
      }),
    ).toBe(30);
  });
});

describe("estimateContextTokens", () => {
  const messages: ReconstructedMessage[] = [
    { role: "user", content: "x".repeat(400) }, // 100 tokens
    { role: "assistant", content: "y".repeat(400) }, // 100 tokens
  ];

  it("uses real usage numbers when available", () => {
    expect(
      estimateContextTokens(messages, 500, {
        inputTokens: 1_000,
        outputTokens: 500,
        totalTokens: 1_500,
      }),
    ).toBe(1_500);
  });

  it("falls back to system prompt + per-message estimates", () => {
    expect(estimateContextTokens(messages, 500)).toBe(500 + 100 + 100);
  });
});

describe("shouldCompact", () => {
  it("triggers only above contextWindow - reserveTokens", () => {
    // 100k window, 20k reserve -> threshold 80k (exclusive)
    expect(shouldCompact(80_000, SETTINGS)).toBe(false);
    expect(shouldCompact(80_001, SETTINGS)).toBe(true);
  });
});

describe("shouldFlushMemory", () => {
  // Flush threshold = 100k - 20k - 4k = 76k (inclusive)
  it("triggers at the soft threshold when no flush has happened yet", () => {
    expect(shouldFlushMemory(76_000, SETTINGS, 0, 0)).toBe(true);
    expect(shouldFlushMemory(75_999, SETTINGS, 0, 0)).toBe(false);
  });

  it("does not flush again until another compaction happens", () => {
    // One flush already done for zero compactions -> wait.
    expect(shouldFlushMemory(90_000, SETTINGS, 0, 1)).toBe(false);
    // After a compaction the flush budget resets.
    expect(shouldFlushMemory(90_000, SETTINGS, 1, 1)).toBe(true);
  });
});
