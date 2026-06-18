import { z } from "zod";

export const setComposioApiKeyInput = z.object({
  apiKey: z
    .string()
    .trim()
    .min(8, "API key looks too short")
    .max(256, "API key looks too long"),
});

export type SetComposioApiKeyInput = z.infer<typeof setComposioApiKeyInput>;
