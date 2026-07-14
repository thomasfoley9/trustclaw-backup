import { describe, expect, it, vi } from "vitest";
import type { ReconstructedMessage } from "../types";

// context-pruning imports sanitizeString from build-context, which drags in
// the db singleton and the compaction pipeline. None of that runs in these
// tests - stub the heavy modules so importing the pruner is side-effect free.
vi.mock("~/server/clients/db", () => ({ db: {} }));
vi.mock("../compaction/run-compaction", () => ({ runCompaction: vi.fn() }));
vi.mock("../compaction/memory-flush", () => ({ runMemoryFlush: vi.fn() }));

import { pruneContext } from "./context-pruning";

// Constants mirrored from context-pruning.ts:
//   soft trim at 30% of the char window (tool outputs > 4000 chars -> head/tail 1500)
//   hard clear at 50% (oldest tool messages with >= 50k output chars replaced)
//   last 3 assistant turns protected
const CONTEXT_WINDOW = 10_000; // tokens -> charWindow = 40_000 chars

function user(text: string): ReconstructedMessage {
  return { role: "user", content: text };
}

function assistant(text: string): ReconstructedMessage {
  return { role: "assistant", content: text };
}

function toolMsg(values: string[]): ReconstructedMessage {
  return {
    role: "tool",
    content: values.map((value, i) => ({
      type: "tool-result" as const,
      toolCallId: `call-${i}`,
      toolName: "some_tool",
      output: { type: "text" as const, value },
    })),
  };
}

function toolOutputValue(msg: ReconstructedMessage, part = 0): string {
  if (msg.role !== "tool") throw new Error("not a tool message");
  const output = msg.content[part]!.output;
  if (output.type !== "text") throw new Error("not a text output");
  return output.value;
}

// Three assistant turns AFTER the prunable region, so the pruner's protected
// boundary sits past the messages we want it to touch.
function trailingTurns(): ReconstructedMessage[] {
  return [
    assistant("reply one"),
    user("next"),
    assistant("reply two"),
    user("more"),
    assistant("reply three"),
  ];
}

describe("pruneContext", () => {
  it("returns the input untouched below the 30% soft-trim threshold", () => {
    const messages = [user("hi"), toolMsg(["x".repeat(5_000)]), ...trailingTurns()];
    // Total ~5KB of a 40KB window = 12.5% < 30%.
    const result = pruneContext(messages, CONTEXT_WINDOW);
    expect(result.prunedCount).toBe(0);
    // Identity, not a clone - the fast path skips the deep copy.
    expect(result.messages).toBe(messages);
  });

  it("soft-trims tool outputs over 4KB to head + tail once past 30%", () => {
    const bigValue = "a".repeat(20_000); // JSON output ~20KB -> total ratio ~0.5+
    const messages = [user("hi"), toolMsg([bigValue]), ...trailingTurns()];

    const result = pruneContext(messages, CONTEXT_WINDOW);

    expect(result.prunedCount).toBe(1);
    const trimmed = toolOutputValue(result.messages[1]!);
    expect(trimmed).toContain("...[trimmed");
    expect(trimmed).toContain("chars]...");
    // head(1500) + marker + tail(1500) - a fraction of the original.
    expect(trimmed.length).toBeLessThan(3_100);
    // Head and tail of the serialized output survive.
    expect(trimmed.startsWith('{"type":"text","value":"aaa')).toBe(true);
    expect(trimmed.endsWith('a"}')).toBe(true);
  });

  it("does not mutate the input messages when trimming", () => {
    const bigValue = "b".repeat(20_000);
    const messages = [user("hi"), toolMsg([bigValue]), ...trailingTurns()];

    const result = pruneContext(messages, CONTEXT_WINDOW);

    expect(result.messages).not.toBe(messages);
    expect(toolOutputValue(messages[1]!)).toBe(bigValue);
  });

  it("leaves small tool outputs alone during a soft trim", () => {
    const messages = [
      user("hi"),
      toolMsg(["small result"]),
      toolMsg(["c".repeat(20_000)]),
      ...trailingTurns(),
    ];

    const result = pruneContext(messages, CONTEXT_WINDOW);

    expect(result.prunedCount).toBe(1);
    expect(toolOutputValue(result.messages[1]!)).toBe("small result");
  });

  it("protects tool results inside the last three assistant turns", () => {
    const bigValue = "d".repeat(20_000);
    // The big tool result sits AFTER the 3rd-from-last assistant message, so
    // it is inside the protected window and must survive even above 30%.
    const messages: ReconstructedMessage[] = [
      user("hi"),
      assistant("reply one"),
      toolMsg([bigValue]),
      assistant("reply two"),
      user("more"),
      assistant("reply three"),
    ];

    const result = pruneContext(messages, CONTEXT_WINDOW);

    expect(result.prunedCount).toBe(0);
    expect(toolOutputValue(result.messages[2]!)).toBe(bigValue);
  });

  it("hard-clears old >=50KB tool messages at 50% of the window", () => {
    // 15 parts x 3500 chars: each part is under the 4KB soft-trim cap, but the
    // message totals ~53KB - exactly the shape the hard clear exists for.
    const parts = Array.from({ length: 15 }, () => "e".repeat(3_500));
    const bigWindow = 25_000; // charWindow 100k; hard clear at 50k
    const messages = [user("hi"), toolMsg(parts), ...trailingTurns()];

    const result = pruneContext(messages, bigWindow);

    expect(result.prunedCount).toBe(1);
    const cleared = result.messages[1]!;
    if (cleared.role !== "tool") throw new Error("expected tool message");
    for (const part of cleared.content) {
      expect(part.output).toEqual({
        type: "text",
        value: "[Old tool result content cleared]",
      });
    }
  });

  it("stops hard-clearing once usage drops back under 50%", () => {
    const parts = () => Array.from({ length: 15 }, () => "f".repeat(3_500));
    const bigWindow = 30_000; // charWindow 120k; hard clear at 60k
    // Two ~53KB tool messages -> ~105KB total (~88%). Clearing the first drops
    // usage to ~44% (< 50%), so the second must survive.
    const messages = [
      user("hi"),
      toolMsg(parts()),
      toolMsg(parts()),
      ...trailingTurns(),
    ];

    const result = pruneContext(messages, bigWindow);

    expect(result.prunedCount).toBe(1);
    expect(toolOutputValue(result.messages[1]!)).toBe(
      "[Old tool result content cleared]",
    );
    expect(toolOutputValue(result.messages[2]!)).toBe("f".repeat(3_500));
  });

  it("skips sub-50KB tool messages during a hard clear", () => {
    const bigParts = Array.from({ length: 15 }, () => "g".repeat(3_500));
    const bigWindow = 25_000;
    const messages = [
      user("hi"),
      toolMsg(["small but old"]),
      toolMsg(bigParts),
      ...trailingTurns(),
    ];

    const result = pruneContext(messages, bigWindow);

    expect(toolOutputValue(result.messages[1]!)).toBe("small but old");
    expect(toolOutputValue(result.messages[2]!)).toBe(
      "[Old tool result content cleared]",
    );
  });
});
