import { z } from "zod";

export const setVoiceIdInput = z.object({
  voiceId: z.string().min(1).max(64),
});

export type SetVoiceIdInput = z.infer<typeof setVoiceIdInput>;
