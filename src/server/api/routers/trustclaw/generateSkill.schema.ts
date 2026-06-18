import { z } from "zod";
import {
  skillNameSchema,
  whenToUseSchema,
  instructionsSchema,
  requiredInputsSchema,
} from "./skills";

export const generateSkillInput = z.object({
  description: z.string().trim().min(10).max(4000),
});
export type GenerateSkillInput = z.infer<typeof generateSkillInput>;

// The structured contract the drafting model must satisfy, and the shape the
// create dialog pre-fills from.
export const skillDraftSchema = z.object({
  name: skillNameSchema,
  whenToUse: whenToUseSchema,
  instructions: instructionsSchema,
  requiredInputs: requiredInputsSchema,
});
export type SkillDraft = z.infer<typeof skillDraftSchema>;
