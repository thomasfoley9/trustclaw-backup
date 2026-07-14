import { describe, expect, it } from "vitest";
import { stripToolResultEchoes } from "./strip-tool-echoes";

// The regex strips "Used <tool>: {" followed by 200+ characters - i.e. a model
// echoing a large raw tool result back at the user.
const bigJson = `{${'"key":"value",'.repeat(30)}"end":true}`; // well over 200 chars

describe("stripToolResultEchoes", () => {
  it("removes a large echoed tool result and trims the remainder", () => {
    const text = `Here's what I found.\n\nUsed GMAIL_FETCH_EMAILS: ${bigJson}`;
    expect(stripToolResultEchoes(text)).toBe("Here's what I found.");
  });

  it("consumes everything after the echo starts (greedy match)", () => {
    const text = `Summary first. Used search: ${bigJson} trailing prose`;
    expect(stripToolResultEchoes(text)).toBe("Summary first.");
  });

  it("keeps short mentions of tool usage (< 200 chars after the brace)", () => {
    const text = 'Used search: {"ok":true} and it worked.';
    expect(stripToolResultEchoes(text)).toBe(text);
  });

  it("leaves normal text untouched", () => {
    const text = "No tools were harmed in the making of this reply.";
    expect(stripToolResultEchoes(text)).toBe(text);
  });

  it("requires the brace - prose after a tool name is preserved", () => {
    const text = `Used search to look things up. ${"prose ".repeat(50)}`.trim();
    expect(stripToolResultEchoes(text)).toBe(text);
  });

  it("returns an empty string when the whole message is an echo", () => {
    expect(stripToolResultEchoes(`Used tool_name: ${bigJson}`)).toBe("");
  });

  it("trims leading whitespace left behind by the removal", () => {
    const text = `   Used tool_name: ${bigJson}`;
    expect(stripToolResultEchoes(text)).toBe("");
  });
});
