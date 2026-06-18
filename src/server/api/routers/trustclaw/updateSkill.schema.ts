import { z } from "zod";
import {
  skillNameSchema,
  whenToUseSchema,
  instructionsSchema,
  requiredInputsSchema,
} from "./skills";

export const updateSkillInput = z.object({
  id: z.string(),
  name: skillNameSchema.optional(),
  whenToUse: whenToUseSchema.optional(),
  instructions: instructionsSchema.optional(),
  requiredInputs: requiredInputsSchema.optional(),
  enabled: z.boolean().optional(),
});
export type UpdateSkillInput = z.infer<typeof updateSkillInput>;
