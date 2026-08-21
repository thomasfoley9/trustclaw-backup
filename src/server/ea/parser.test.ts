import { describe, expect, it } from "vitest";
import { parseReply, resolveSnoozeUntil } from "./parser";
import { isQuietHours } from "./config";
import moment from "moment-timezone";

// Wednesday 2026-08-19 10:00 PT
const NOW = moment.tz("2026-08-19 10:00", "America/Los_Angeles").toDate();

describe("parseReply", () => {
  it("parses done with and without an explicit id", () => {
    expect(parseReply("done T-14", NOW)).toEqual({
      kind: "done",
      taskRef: "T-14",
    });
    expect(parseReply("done 14", NOW)).toEqual({
      kind: "done",
      taskRef: "T-14",
    });
    expect(parseReply("Done", NOW)).toEqual({ kind: "done", taskRef: null });
  });

  it("parses kill and its sloppy variants", () => {
    expect(parseReply("kill it t14", NOW)).toEqual({
      kind: "kill",
      taskRef: "T-14",
    });
    expect(parseReply("cancel 7", NOW)).toEqual({
      kind: "kill",
      taskRef: "T-7",
    });
  });

  it("parses what's due in several spellings", () => {
    expect(parseReply("what's due", NOW)).toEqual({ kind: "whats_due" });
    expect(parseReply("whats due?", NOW)).toEqual({ kind: "whats_due" });
    expect(parseReply("whats open", NOW)).toEqual({ kind: "whats_due" });
  });

  it("parses send-ready and draft-it", () => {
    expect(parseReply("send-ready T-14", NOW)).toEqual({
      kind: "send_ready",
      taskRef: "T-14",
    });
    expect(parseReply("sendready 14", NOW)).toEqual({
      kind: "send_ready",
      taskRef: "T-14",
    });
    expect(parseReply("draft it T-9", NOW)).toEqual({
      kind: "draft",
      taskRef: "T-9",
    });
  });

  it("parses snooze with a relative date", () => {
    const parsed = parseReply("snooze T-14 til friday", NOW);
    expect(parsed?.kind).toBe("snooze");
    if (parsed?.kind === "snooze") {
      expect(parsed.taskRef).toBe("T-14");
      const local = moment.tz(parsed.until, "America/Los_Angeles");
      expect(local.format("dddd HH:mm")).toBe("Friday 09:00");
    }
  });

  it("hands natural language to the agent instead of guessing", () => {
    expect(parseReply("push my 5pm to tomorrow and check on acme", NOW)).toBe(
      null,
    );
    expect(parseReply("snooze until the acme deal closes", NOW)).toBe(null);
  });
});

describe("resolveSnoozeUntil", () => {
  it("resolves weekdays forward, never backward", () => {
    // NOW is Wednesday; "monday" means NEXT Monday.
    const monday = resolveSnoozeUntil("monday", NOW);
    expect(moment.tz(monday, "America/Los_Angeles").format("dddd")).toBe(
      "Monday",
    );
    expect(monday!.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("resolves durations and clock times", () => {
    const in3h = resolveSnoozeUntil("3 hours", NOW);
    expect(in3h!.getTime() - NOW.getTime()).toBe(3 * 3600_000);

    const at8pm = resolveSnoozeUntil("8pm", NOW);
    expect(moment.tz(at8pm, "America/Los_Angeles").format("HH:mm")).toBe(
      "20:00",
    );
  });
});

describe("isQuietHours", () => {
  it("is quiet from 9pm through 6:30am PT and loud otherwise", () => {
    const at = (time: string) =>
      isQuietHours(moment.tz(`2026-08-19 ${time}`, "America/Los_Angeles").toDate());
    expect(at("21:00")).toBe(true);
    expect(at("23:59")).toBe(true);
    expect(at("06:29")).toBe(true);
    expect(at("06:30")).toBe(false);
    expect(at("07:00")).toBe(false);
    expect(at("20:59")).toBe(false);
  });
});
