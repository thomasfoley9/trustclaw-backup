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

  it("trims oldest-first and stops at the low-water mark", () => {
    // Two 30KB fetches in a 200KB char window (50K tokens): total ~60.5KB
    // crosses the 60KB (30%) trigger. Reclaiming the OLDEST alone reaches the
    // 40KB (20%) low-water mark, so the newer fetch must survive verbatim -
    // this is the "what did that email say?" guarantee for recent results.
    const older = "h".repeat(30_000);
    const newer = "i".repeat(30_000);
    const messages = [
      user("triage my inbox"),
      toolMsg([older]),
      user("now the thread from Sarah"),
      toolMsg([newer]),
      ...trailingTurns(),
    ];

    const result = pruneContext(messages, 50_000);

    expect(result.prunedCount).toBe(1);
    expect(toolOutputValue(result.messages[1]!)).toContain("...[trimmed");
    expect(toolOutputValue(result.messages[3]!)).toBe(newer);
  });

  it("keeps trimming older results until the budget is met", () => {
    // Three 30KB fetches, same window: ~90KB total needs two trims to get
    // under 60KB. The newest unprotected fetch still survives.
    const messages = [
      user("one"),
      toolMsg(["j".repeat(30_000)]),
      user("two"),
      toolMsg(["k".repeat(30_000)]),
      user("three"),
      toolMsg(["l".repeat(30_000)]),
      ...trailingTurns(),
    ];

    const result = pruneContext(messages, 50_000);

    expect(result.prunedCount).toBe(2);
    expect(toolOutputValue(result.messages[1]!)).toContain("...[trimmed");
    expect(toolOutputValue(result.messages[3]!)).toContain("...[trimmed");
    expect(toolOutputValue(result.messages[5]!)).toBe("l".repeat(30_000));
  });

  it("leaves a stable prefix while growth stays inside the hysteresis band", () => {
    // After a trim event the context sits at the 20% low-water mark. Growth
    // that stays under the 30% trigger must cause ZERO new trims (fast path,
    // same array identity) - this is what keeps the prompt-cache prefix
    // byte-stable between frontier moves instead of invalidating it per turn.
    const messages = [
      user("one"),
      toolMsg(["o".repeat(30_000)]),
      user("two"),
      toolMsg(["p".repeat(30_000)]),
      ...trailingTurns(),
    ];

    const first = pruneContext(messages, 50_000); // trims oldest to ~33KB
    expect(first.prunedCount).toBe(1);

    const grown = [
      ...first.messages,
      user("follow-up"),
      toolMsg(["q".repeat(20_000)]), // 33KB + 20KB = 53KB < 60KB trigger
      ...trailingTurns(),
    ];
    const second = pruneContext(grown, 50_000);

    expect(second.prunedCount).toBe(0);
    expect(second.messages).toBe(grown);
  });

  it("never trims a part when re-escaping would make it larger", () => {
    // Escape-dense outputs (quotes/backslashes) can INFLATE when sliced and
    // re-stringified. Trimming must only ever shrink, so such parts are
    // skipped even under budget pressure.
    const escapeDense = '"'.repeat(2_100); // stringifies to ~4.2KB, just over the cap
    const filler = "r".repeat(30_000);
    const messages = [
      user("hi"),
      toolMsg([escapeDense]),
      toolMsg([filler]),
      ...trailingTurns(),
    ];

    const result = pruneContext(messages, 25_000); // charWindow 100KB, trigger 30KB

    expect(toolOutputValue(result.messages[1]!)).toBe(escapeDense);
    expect(toolOutputValue(result.messages[2]!)).toContain("...[trimmed");
  });

  it("is idempotent - re-pruning trimmed output does not trim further", () => {
    const messages = [
      user("hi"),
      toolMsg(["m".repeat(30_000)]),
      toolMsg(["n".repeat(30_000)]),
      ...trailingTurns(),
    ];

    const once = pruneContext(messages, 50_000);
    const twice = pruneContext(once.messages, 50_000);

    expect(once.prunedCount).toBe(1);
    expect(twice.prunedCount).toBe(0);
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
