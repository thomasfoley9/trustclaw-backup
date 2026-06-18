import { z } from "zod";

export const toggleSkillInput = z.object({
  id: z.string(),
  enabled: z.boolean(),
});
export type ToggleSkillInput = z.infer<typeof toggleSkillInput>;
