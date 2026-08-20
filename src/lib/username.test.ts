import { describe, expect, it } from "vitest";
import {
  USERNAME_HINT,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  isValidUsernameChars,
  validateUsername,
} from "./username";

describe("length constants", () => {
  // Both the register form (minLength/maxLength attributes) and the Better
  // Auth plugin read these - a silent change would desync client and server.
  it("exports the documented bounds", () => {
    expect(USERNAME_MIN_LENGTH).toBe(3);
    expect(USERNAME_MAX_LENGTH).toBe(30);
  });
});

describe("isValidUsernameChars", () => {
  it.each(["abc", "casey-5672", "a.b_c-1", "UPPER", "user123", "___", "..."])(
    "accepts %s",
    (username) => {
      expect(isValidUsernameChars(username)).toBe(true);
    },
  );

  it.each([
    "has space",
    "email@style",
    "hash#tag",
    "slash/name",
    "ümlaut",
    "emoji😀",
    "semi;colon",
    "",
    "tab\tname",
  ])("rejects %j", (username) => {
    expect(isValidUsernameChars(username)).toBe(false);
  });
});

describe("validateUsername", () => {
  it("returns null for a valid username", () => {
    expect(validateUsername("casey-5672")).toBeNull();
    expect(validateUsername("abc")).toBeNull(); // exactly min length
    expect(validateUsername("a".repeat(USERNAME_MAX_LENGTH))).toBeNull();
  });

  it("rejects usernames under the minimum length", () => {
    expect(validateUsername("ab")).toBe(
      `Username must be at least ${USERNAME_MIN_LENGTH} characters.`,
    );
    expect(validateUsername("")).toBe(
      `Username must be at least ${USERNAME_MIN_LENGTH} characters.`,
    );
  });

  it("rejects usernames over the maximum length", () => {
    expect(validateUsername("a".repeat(USERNAME_MAX_LENGTH + 1))).toBe(
      `Username must be at most ${USERNAME_MAX_LENGTH} characters.`,
    );
  });

  it("rejects invalid characters with the shared hint text", () => {
    expect(validateUsername("bad name")).toBe(
      `Username can only contain ${USERNAME_HINT.toLowerCase()}.`,
    );
  });

  it("checks length before the character pattern", () => {
    // "@!" is both too short and invalid - the length message wins.
    expect(validateUsername("@!")).toBe(
      `Username must be at least ${USERNAME_MIN_LENGTH} characters.`,
    );
  });
});
