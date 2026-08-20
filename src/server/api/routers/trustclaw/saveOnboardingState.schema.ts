import { z } from "zod";
import { selectableModelSchema } from "./createInstance.schema";

export const onboardingStepSchema = z.enum([
  "name",
  "writing-style",
  "personality",
  "emoji",
  "lore",
  "model",
  "integrations",
  "telegram",
]);

export type OnboardingStep = z.infer<typeof onboardingStepSchema>;

// Caps: these fields are baked verbatim into the agent's identity/soul
// prompts, so unbounded strings would let a client persist megabytes straight
// into every future system prompt.
export const saveOnboardingStateInput = z.object({
  currentStep: onboardingStepSchema,
  name: z.string().max(200).default(""),
  writingStyle: z.string().max(2_000).nullable().default(null),
  funWritingStyle: z.string().max(2_000).nullable().default(null),
  personality: z.string().max(2_000).nullable().default(null),
  emoji: z.string().max(64).nullable().default(null),
  lore: z.string().max(20_000).default(""),
  anthropicModel: selectableModelSchema.default("house/kimi-k3"),
});

export type SaveOnboardingStateInput = z.infer<typeof saveOnboardingStateInput>;
