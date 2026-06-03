import { z } from "zod";
import {
  personalityNameSchema,
  personalityPromptSchema,
  personalityEmojiSchema,
} from "./personalities";

export const createPersonalityInput = z.object({
  name: personalityNameSchema,
  prompt: personalityPromptSchema,
  emoji: personalityEmojiSchema.optional(),
  avatarKey: z.string().max(40).optional(),
});

export type CreatePersonalityInput = z.infer<typeof createPersonalityInput>;
