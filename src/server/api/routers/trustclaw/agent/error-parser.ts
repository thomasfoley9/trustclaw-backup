import { TRPCError } from "@trpc/server";
import { z } from "zod";

const composioApiErrorSchema = z
  .object({
    error: z
      .object({
        message: z.string().optional(),
        suggested_fix: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

// OpenAI-compatible providers (DeepSeek, Moonshot, OpenRouter, OpenAI) return
// errors as { error: { message, type } } - sometimes with a top-level message
// too (Moonshot 404s set error to a string plus a separate message).
const providerErrorSchema = z
  .object({
    error: z
      .union([
        z.object({ message: z.string().optional() }).passthrough(),
        z.string(),
      ])
      .optional(),
    message: z.string().optional(),
  })
  .passthrough();

// The AI SDK's APICallError carries the provider's raw response on .responseBody.
const apiCallErrorSchema = z
  .object({ responseBody: z.string().optional() })
  .passthrough();

function providerMessageFromBody(body: string): string | null {
  try {
    const json: unknown = JSON.parse(body);
    const parsed = providerErrorSchema.safeParse(json);
    if (!parsed.success) return null;
    const e = parsed.data.error;
    if (e && typeof e === "object" && e.message) return e.message;
    if (parsed.data.message) return parsed.data.message;
    return null;
  } catch {
    return null;
  }
}

export function parseAgentError(error: unknown): string {
  // Our own precondition errors ("Set your Composio API key in Settings",
  // "Add your Anthropic API key first") are written for display - pass them
  // through instead of flattening to the generic fallback.
  if (error instanceof TRPCError && error.message) {
    return error.message;
  }

  const raw = error instanceof Error ? error.message : String(error);

  // OpenAI-compatible providers (house models + BYO custom models) put the real
  // error on the AI SDK error's .responseBody, not the message.
  const body = apiCallErrorSchema.safeParse(error).data?.responseBody ?? null;
  const haystack = body ? `${raw} ${body}` : raw;

  // Out-of-credits / suspended account across providers.
  if (
    /insufficient balance|exceeded_current_quota|insufficient_quota|out of credits|credit balance|insufficient_funds/i.test(
      haystack,
    )
  ) {
    // A response body means an OpenAI-compatible provider - i.e. a house model
    // on the owner's key, or the user's own BYO model.
    if (body) {
      return "This model's provider account is out of balance/credits. For a house model the owner needs to top it up; for your own model, recharge that provider - then try again.";
    }
    return "Your Anthropic account is out of API credits. Add billing/credits at console.anthropic.com (this is separate from a Claude.ai subscription), then try again.";
  }

  if (/rate.?limit|429|too many requests/i.test(haystack)) {
    return "Rate limit exceeded. Please wait a moment and try again.";
  }

  // Composio tool errors embed "<status> {json}" in the message.
  const jsonMatch = /\d{3}\s*(\{.*\})/.exec(raw);
  if (jsonMatch?.[1]) {
    try {
      const rawJson: unknown = JSON.parse(jsonMatch[1]);
      const parsed = composioApiErrorSchema.safeParse(rawJson);
      if (parsed.success) {
        if (parsed.data.error?.suggested_fix) {
          return parsed.data.error.suggested_fix;
        }
        if (parsed.data.error?.message) {
          return parsed.data.error.message;
        }
      }
    } catch {
      // Fall through
    }
  }

  if (raw.includes("invalid x-api-key") || raw.includes("invalid_api_key")) {
    return "Your Anthropic API key was rejected - double-check it in Settings → Anthropic API key.";
  }

  if (raw.includes("not_found_error") || raw.includes("model_not_found")) {
    return "That model isn't available on your Anthropic account - pick a different one in Settings.";
  }

  // A clean message from the provider's response body beats a generic fallback.
  if (body) {
    const msg = providerMessageFromBody(body);
    if (msg && /[a-z]/i.test(msg)) return msg;
  }

  return "Something went wrong. Please try again.";
}
