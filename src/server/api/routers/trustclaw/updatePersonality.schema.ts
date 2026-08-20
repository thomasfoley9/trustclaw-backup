import { z } from "zod";
import {
  personalityNameSchema,
  personalityPromptSchema,
  personalityEmojiSchema,
} from "./personalities";

export const updatePersonalityInput = z.object({
  id: z.string(),
  name: personalityNameSchema.optional(),
  prompt: personalityPromptSchema.optional(),
  emoji: personalityEmojiSchema.nullable().optional(),
  avatarKey: z.string().max(40).nullable().optional(),
});

export type UpdatePersonalityInput = z.infer<typeof updatePersonalityInput>;
