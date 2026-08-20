import { describe, expect, it } from "vitest";
import { serializeMessages } from "./prompts";
import type { ReconstructedMessage } from "../types";

const bigOutput = "X".repeat(80_000);

const convo: ReconstructedMessage[] = [
  { role: "user", content: "scrape example.com and tell me the price" },
  {
    role: "assistant",
    content: [
      { type: "text", text: "Fetching the page." },
      {
        type: "tool-call",
        toolCallId: "t1",
        toolName: "WEB_FETCH",
        input: { url: "https://example.com" },
      },
    ],
  },
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "t1",
        toolName: "WEB_FETCH",
        output: { type: "text", value: bigOutput },
      },
    ],
  },
  { role: "assistant", content: "The price is $42." },
];

describe("serializeMessages", () => {
  it("preserves full tool output by default (compaction path unchanged)", () => {
    const out = serializeMessages(convo);
    expect(out).toContain(bigOutput);
    expect(out.length).toBeGreaterThan(80_000);
  });

  it("truncates oversized tool output when a cap is passed (distill path)", () => {
    const out = serializeMessages(convo, { maxToolOutputChars: 2_000 });
    expect(out).not.toContain(bigOutput);
    expect(out).toContain("chars truncated");
    // conversational text survives the truncation
    expect(out).toContain("The price is $42.");
    expect(out).toContain("scrape example.com");
    // the whole transcript is now bounded, not 80KB+
    expect(out.length).toBeLessThan(6_000);
  });

  it("leaves small tool outputs intact under a cap", () => {
    const small: ReconstructedMessage[] = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "t2",
            toolName: "CALC",
            output: { type: "text", value: "result: 4" },
          },
        ],
      },
    ];
    const out = serializeMessages(small, { maxToolOutputChars: 2_000 });
    expect(out).toContain("result: 4");
    expect(out).not.toContain("truncated");
  });
});
