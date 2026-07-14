import { describe, expect, it } from "vitest";
import { telegramUpdateInput } from "./_telegram-webhook.schema";

// This schema is the first parser touching untrusted webhook input - anything
// Telegram (or an attacker who found the endpoint) posts goes through here.

const textlessMessage = {
  message_id: 42,
  date: 1_767_225_600,
  chat: { id: 987654321, type: "private" as const, username: "thomas" },
  from: { id: 111, is_bot: false, first_name: "Thomas" },
};

const validUpdate = {
  update_id: 123456789,
  message: { ...textlessMessage, text: "hello claw" },
};

describe("telegramUpdateInput", () => {
  it("parses a full valid update", () => {
    const result = telegramUpdateInput.safeParse(validUpdate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message?.text).toBe("hello claw");
      expect(result.data.message?.chat.id).toBe(987654321);
    }
  });

  it("parses an update without a message (e.g. edited_message-only payloads)", () => {
    expect(telegramUpdateInput.safeParse({ update_id: 1 }).success).toBe(true);
  });

  it("parses a message without text (stickers, photos)", () => {
    expect(
      telegramUpdateInput.safeParse({ update_id: 1, message: textlessMessage })
        .success,
    ).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "junk"],
    ["a number", 42],
    ["an array", [1, 2, 3]],
    ["an empty object", {}],
  ])("rejects %s", (_label, junk) => {
    expect(telegramUpdateInput.safeParse(junk).success).toBe(false);
  });

  it("rejects a missing update_id", () => {
    expect(
      telegramUpdateInput.safeParse({ message: validUpdate.message }).success,
    ).toBe(false);
  });

  it("rejects wrong types for update_id", () => {
    expect(telegramUpdateInput.safeParse({ update_id: "123" }).success).toBe(
      false,
    );
    expect(telegramUpdateInput.safeParse({ update_id: 1.5 }).success).toBe(
      false,
    );
  });

  it("rejects a message missing required fields", () => {
    expect(
      telegramUpdateInput.safeParse({
        update_id: 1,
        message: { message_id: 42 }, // no date, no chat
      }).success,
    ).toBe(false);
  });

  it("rejects a chat with an unknown type", () => {
    const bad = structuredClone(validUpdate);
    // @ts-expect-error - deliberately invalid enum value
    bad.message.chat.type = "broadcast";
    expect(telegramUpdateInput.safeParse(bad).success).toBe(false);
  });

  it("rejects non-string text", () => {
    const bad = { ...validUpdate, message: { ...validUpdate.message, text: 42 } };
    expect(telegramUpdateInput.safeParse(bad).success).toBe(false);
  });

  it("accepts oversized text (no length cap at the schema layer)", () => {
    const big = {
      ...validUpdate,
      message: { ...validUpdate.message, text: "x".repeat(100_000) },
    };
    const result = telegramUpdateInput.safeParse(big);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message?.text).toHaveLength(100_000);
    }
  });

  it("strips unknown keys instead of letting them through", () => {
    const withExtra = { ...validUpdate, evil_extra: "payload" };
    const result = telegramUpdateInput.safeParse(withExtra);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("evil_extra");
    }
  });
});
