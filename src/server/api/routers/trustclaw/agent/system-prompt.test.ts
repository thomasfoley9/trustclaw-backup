import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSystemPrompt } from "./system-prompt";

// The prompt ends with "## Current Time" rendered via moment().tz(timezone),
// so the clock is frozen and the timezone passed explicitly - unfrozen
// snapshots would break every day.
const FROZEN_NOW = new Date("2026-01-15T17:30:00.000Z");

const baseParams = {
  soulPrompt: null,
  identityPrompt: null,
  userPrompt: null,
  userTimezone: "UTC",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("buildSystemPrompt", () => {
  it("renders the default config", () => {
    expect(buildSystemPrompt(baseParams)).toMatchSnapshot();
  });

  it("renders incognito mode", () => {
    expect(
      buildSystemPrompt({ ...baseParams, incognito: true }),
    ).toMatchSnapshot();
  });

  it("renders an active persona", () => {
    expect(
      buildSystemPrompt({
        ...baseParams,
        soulPrompt: "## Who You Are\n\nYou are Sherlock: precise, deductive.",
        activePersonalityName: "Sherlock",
      }),
    ).toMatchSnapshot();
  });

  it("renders the session-continuity note with a compaction summary", () => {
    expect(
      buildSystemPrompt({ ...baseParams, hasCompactionSummary: true }),
    ).toMatchSnapshot();
  });

  describe("incognito must not advertise memory tools", () => {
    it("swaps the memory tool docs for the incognito note", () => {
      const prompt = buildSystemPrompt({ ...baseParams, incognito: true });
      expect(prompt).toContain("Memory is OFF (incognito)");
      expect(prompt).not.toContain("### memory_save");
      expect(prompt).not.toContain("### memory_search");
    });

    it("advertises both memory tools when not incognito", () => {
      const prompt = buildSystemPrompt(baseParams);
      expect(prompt).toContain("### memory_save");
      expect(prompt).toContain("### memory_search");
      expect(prompt).not.toContain("Memory is OFF");
    });
  });

  describe("current time rendering", () => {
    it("formats the frozen clock in the user's timezone", () => {
      const utc = buildSystemPrompt(baseParams);
      expect(utc).toContain(
        "## Current Time\n\nThursday, January 15, 2026 5:30 PM (UTC)",
      );

      const ny = buildSystemPrompt({
        ...baseParams,
        userTimezone: "America/New_York",
      });
      expect(ny).toContain(
        "## Current Time\n\nThursday, January 15, 2026 12:30 PM (America/New_York)",
      );
    });
  });

  it("layers identity, user prompt, and memories in order", () => {
    const prompt = buildSystemPrompt({
      ...baseParams,
      identityPrompt: "## Identity\n\nYour name is Luna.",
      userPrompt: "## About Your Human\n\nThomas, works at Composio.",
      relevantMemories: ["Prefers concise replies", "Timezone is US Eastern"],
      productKnowledge: ["The staging URL is staging.example.com"],
    });
    expect(prompt).toContain("Your name is Luna.");
    expect(prompt).toContain("Thomas, works at Composio.");
    expect(prompt).toContain("- Prefers concise replies");
    expect(prompt).toContain("- The staging URL is staging.example.com");
    // Identity comes before tools; memories come after saved knowledge.
    expect(prompt.indexOf("Your name is Luna.")).toBeLessThan(
      prompt.indexOf("## Composio Tool Router"),
    );
    expect(prompt.indexOf("## Saved Knowledge")).toBeLessThan(
      prompt.indexOf("## Relevant Memories"),
    );
  });

  it("uncensored mode swaps the soul prompt and drops persona framing", () => {
    const prompt = buildSystemPrompt({
      ...baseParams,
      uncensored: true,
      activePersonalityName: "Sherlock",
      identityPrompt: "## Identity\n\nYour name is Luna.",
    });
    expect(prompt).toContain("Unhinged Mode");
    expect(prompt).not.toContain("Your name is Luna.");
    expect(prompt).not.toContain("Active Personality: Sherlock");
  });
});
