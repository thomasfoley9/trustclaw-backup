import { describe, expect, it } from "vitest";
import { formatCronDate, formatCronExpression } from "./cron-format";

describe("formatCronExpression", () => {
  describe("plain minute/hour phrasing", () => {
    it("renders the top of every hour", () => {
      expect(formatCronExpression("0 * * * *")).toBe("Every hour");
    });

    it("renders a fixed minute past every hour, zero-padded", () => {
      expect(formatCronExpression("30 * * * *")).toBe("Every hour at :30");
      expect(formatCronExpression("5 * * * *")).toBe("Every hour at :05");
    });

    it("renders a daily time", () => {
      expect(formatCronExpression("5 9 * * *")).toBe("Daily at 9:05");
      expect(formatCronExpression("0 0 * * *")).toBe("Daily at 0:00");
    });

    it("renders a weekly day + time", () => {
      expect(formatCronExpression("0 9 * * 1")).toBe("Every Monday at 9:00");
      expect(formatCronExpression("30 17 * * 5")).toBe("Every Friday at 17:30");
      expect(formatCronExpression("0 8 * * 0")).toBe("Every Sunday at 8:00");
    });
  });

  describe("isPlain guard - step/range/list syntax falls back to the raw expression", () => {
    it.each([
      "*/15 * * * *", // step minute would render "Every hour at :*/15"
      "1-5 9 * * *", // range minute
      "0,30 * * * *", // list minute
      "0 */2 * * *", // step hour
      "0 9-17 * * *", // range hour
      "15,45 9 * * 1", // list minute on a weekly job
    ])("returns %s unchanged", (expression) => {
      expect(formatCronExpression(expression)).toBe(expression);
    });
  });

  describe("unhandled shapes fall back to the raw expression", () => {
    it.each([
      "0 9 1 * *", // day-of-month set
      "0 9 * 6 *", // month set
      "0 9 1 * 1", // day-of-month AND day-of-week
    ])("returns %s unchanged", (expression) => {
      expect(formatCronExpression(expression)).toBe(expression);
    });

    it("returns malformed expressions unchanged", () => {
      expect(formatCronExpression("0 9 * *")).toBe("0 9 * *"); // 4 fields
      expect(formatCronExpression("0 9 * * * *")).toBe("0 9 * * * *"); // 6 fields
      expect(formatCronExpression("not a cron")).toBe("not a cron");
      expect(formatCronExpression("")).toBe("");
    });
  });

  it("uses an unknown day-of-week token verbatim", () => {
    expect(formatCronExpression("0 9 * * 7")).toBe("Every 7 at 9:00");
  });
});

describe("formatCronDate", () => {
  it("renders a dash for null", () => {
    expect(formatCronDate(null)).toBe("-");
  });

  it("formats a Date in the local timezone", () => {
    // Construct via local components so the assertion is TZ-independent.
    const date = new Date(2026, 0, 15, 9, 5);
    expect(formatCronDate(date)).toBe("Jan 15, 9:05 AM");
  });

  it("formats an afternoon time with 12-hour AM/PM", () => {
    const date = new Date(2026, 6, 4, 17, 30);
    expect(formatCronDate(date)).toBe("Jul 4, 5:30 PM");
  });
});
