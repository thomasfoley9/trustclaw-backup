import { z } from "zod";
import {
  skillNameSchema,
  whenToUseSchema,
  instructionsSchema,
  requiredInputsSchema,
} from "./skills";

export const createSkillInput = z.object({
  name: skillNameSchema,
  whenToUse: whenToUseSchema,
  instructions: instructionsSchema,
  requiredInputs: requiredInputsSchema,
});
export type CreateSkillInput = z.infer<typeof createSkillInput>;
