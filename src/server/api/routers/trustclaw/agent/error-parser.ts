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

export function parseAgentError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

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
    return "Your Anthropic API key was rejected — double-check it in Settings → Anthropic API key.";
  }

  if (raw.includes("rate_limit") || raw.includes("429")) {
    return "Rate limit exceeded. Please wait a moment and try again.";
  }

  if (raw.includes("credit balance") || raw.includes("insufficient_funds")) {
    return "Your Anthropic account is out of API credits. Add billing/credits at console.anthropic.com (this is separate from a Claude.ai subscription), then try again.";
  }

  if (raw.includes("not_found_error") || raw.includes("model_not_found")) {
    return "That model isn't available on your Anthropic account — pick a different one in Settings.";
  }

  return "Something went wrong. Please try again.";
}
