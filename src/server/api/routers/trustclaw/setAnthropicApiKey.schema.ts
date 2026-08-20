import { z } from "zod";

export const setAnthropicApiKeyInput = z.object({
  apiKey: z
    .string()
    .trim()
    .min(20, "API key looks too short")
    .max(256, "API key looks too long"),
});

export type SetAnthropicApiKeyInput = z.infer<typeof setAnthropicApiKeyInput>;
