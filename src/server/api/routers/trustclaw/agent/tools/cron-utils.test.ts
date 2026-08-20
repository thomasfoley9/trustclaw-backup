import { describe, expect, it } from "vitest";
import {
  computeNextRunAt,
  meetsMinInterval,
  validateCronExpression,
} from "./cron-utils";

const TZ = "America/Los_Angeles";

describe("validateCronExpression", () => {
  it("accepts standard expressions", () => {
    expect(validateCronExpression("0 7 * * *")).toBe(true);
    expect(validateCronExpression("*/30 * * * *")).toBe(true);
  });

  it("rejects garbage", () => {
    expect(validateCronExpression("not a cron")).toBe(false);
  });
});

describe("meetsMinInterval", () => {
  // Owner-spend guard: agent-created jobs may not fire more than every 15 min.
  it.each(["* * * * *", "*/1 * * * *", "*/5 * * * *", "*/10 * * * *"])(
    "rejects %s (more frequent than every 15 minutes)",
    (expr) => {
      expect(meetsMinInterval(expr, TZ)).toBe(false);
    },
  );

  it.each(["*/15 * * * *", "*/30 * * * *", "0 * * * *", "0 7 * * *", "0 7 * * 1"])(
    "accepts %s",
    (expr) => {
      expect(meetsMinInterval(expr, TZ)).toBe(true);
    },
  );

  it("accepts a one-shot (single future run) expression", () => {
    // Specific date far in the future - croner yields one run then none for
    // over a year, comfortably past the floor.
    expect(meetsMinInterval("0 17 6 7 *", TZ)).toBe(true);
  });

  it("rejects invalid expressions", () => {
    expect(meetsMinInterval("nope", TZ)).toBe(false);
  });
});

describe("computeNextRunAt", () => {
  it("returns a future date", () => {
    const next = computeNextRunAt("0 7 * * *", TZ);
    expect(next.getTime()).toBeGreaterThan(Date.now());
  });
});
