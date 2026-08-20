import { z } from "zod";

export const setVoiceApiKeyInput = z.object({
  apiKey: z.string().min(8),
});

export type SetVoiceApiKeyInput = z.infer<typeof setVoiceApiKeyInput>;
