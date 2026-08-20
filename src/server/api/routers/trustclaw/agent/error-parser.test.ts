import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { parseAgentError } from "./error-parser";

const FALLBACK = "Something went wrong. Please try again.";

// The AI SDK's APICallError carries the provider's raw JSON on .responseBody.
function apiCallError(message: string, responseBody: string): Error {
  return Object.assign(new Error(message), { responseBody });
}

describe("parseAgentError", () => {
  it("passes our own TRPCError messages through verbatim", () => {
    const error = new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Set your Composio API key in Settings",
    });
    expect(parseAgentError(error)).toBe("Set your Composio API key in Settings");
  });

  describe("out of credits", () => {
    it.each([
      "insufficient balance",
      "exceeded_current_quota",
      "insufficient_quota",
      "out of credits",
      "Your credit balance is too low",
      "insufficient_funds",
    ])("maps %s (no response body) to the Anthropic credits message", (text) => {
      expect(parseAgentError(new Error(text))).toContain(
        "out of API credits",
      );
      expect(parseAgentError(new Error(text))).toContain(
        "console.anthropic.com",
      );
    });

    it("maps a provider response body to the house/BYO model message", () => {
      const error = apiCallError(
        "API call failed",
        '{"error":{"message":"Insufficient Balance"}}',
      );
      expect(parseAgentError(error)).toContain(
        "provider account is out of balance/credits",
      );
    });

    // Regression: live prod 2026-08-18 - a house-model (Moonshot) credit error
    // arrived WITHOUT a responseBody and keyless users were told to fund
    // console.anthropic.com. With the model hint the parser must blame the
    // actual provider.
    it("never blames the user's Anthropic account for a house model, even without a response body", () => {
      const msg = parseAgentError(new Error("insufficient balance"), {
        model: "house/kimi-k3",
      });
      expect(msg).toContain("provider account is out of balance/credits");
      expect(msg).not.toContain("console.anthropic.com");
    });

    it("never blames Anthropic for a non-Anthropic custom model", () => {
      const msg = parseAgentError(new Error("insufficient_quota"), {
        model: "deepseek/deepseek-chat",
      });
      expect(msg).toContain("provider account is out of balance/credits");
      expect(msg).not.toContain("console.anthropic.com");
    });

    it("still blames Anthropic for Claude models without a response body", () => {
      const msg = parseAgentError(new Error("out of credits"), {
        model: "claude-sonnet-5",
      });
      expect(msg).toContain("console.anthropic.com");
    });
  });

  describe("rate limits", () => {
    it.each(["rate limit exceeded", "rate-limit hit", "HTTP 429", "Too Many Requests"])(
      "maps %s to the rate limit message",
      (text) => {
        expect(parseAgentError(new Error(text))).toBe(
          "Rate limit exceeded. Please wait a moment and try again.",
        );
      },
    );
  });

  describe("Composio embedded JSON errors", () => {
    it("prefers suggested_fix when present", () => {
      const error = new Error(
        'Composio error: 400 {"error":{"message":"No connected account","suggested_fix":"Reconnect your Gmail account in the dashboard"}}',
      );
      expect(parseAgentError(error)).toBe(
        "Reconnect your Gmail account in the dashboard",
      );
    });

    it("falls back to error.message when there is no suggested_fix", () => {
      const error = new Error(
        'Composio error: 404 {"error":{"message":"Toolkit not found"}}',
      );
      expect(parseAgentError(error)).toBe("Toolkit not found");
    });

    it("ignores unparseable JSON after a status code", () => {
      const error = new Error("failed: 500 {not-json");
      expect(parseAgentError(error)).toBe(FALLBACK);
    });
  });

  it("maps rejected Anthropic API keys to the settings hint", () => {
    expect(parseAgentError(new Error("invalid x-api-key"))).toContain(
      "Anthropic API key was rejected",
    );
    expect(
      parseAgentError(new Error("401 invalid_api_key: bad key")),
    ).toContain("Anthropic API key was rejected");
  });

  it("maps unknown-model errors to the model picker hint", () => {
    expect(parseAgentError(new Error("not_found_error: model x"))).toContain(
      "isn't available on your Anthropic account",
    );
    expect(parseAgentError(new Error("model_not_found"))).toContain(
      "isn't available on your Anthropic account",
    );
  });

  describe("provider response bodies", () => {
    it("surfaces error.message from an OpenAI-shaped body", () => {
      const error = apiCallError(
        "API call failed",
        '{"error":{"message":"The model is overloaded, retry shortly","type":"server_error"}}',
      );
      expect(parseAgentError(error)).toBe(
        "The model is overloaded, retry shortly",
      );
    });

    it("surfaces the top-level message when error is a string (Moonshot 404s)", () => {
      const error = apiCallError(
        "API call failed",
        '{"error":"NotFound","message":"the requested resource does not exist"}',
      );
      expect(parseAgentError(error)).toBe(
        "the requested resource does not exist",
      );
    });

    it("ignores a body without any usable message", () => {
      const error = apiCallError("API call failed", '{"status":500}');
      expect(parseAgentError(error)).toBe(FALLBACK);
    });

    it("ignores a non-JSON body", () => {
      const error = apiCallError("API call failed", "<html>502</html>");
      expect(parseAgentError(error)).toBe(FALLBACK);
    });
  });

  it("falls back to the generic message for unknown errors", () => {
    expect(parseAgentError(new Error("ECONNRESET"))).toBe(FALLBACK);
    expect(parseAgentError("plain string failure")).toBe(FALLBACK);
    expect(parseAgentError(undefined)).toBe(FALLBACK);
  });
});
