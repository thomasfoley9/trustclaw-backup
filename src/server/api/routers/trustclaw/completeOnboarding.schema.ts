import { z } from "zod";

export const completeOnboardingInput = z.object({}).optional();

export type CompleteOnboardingInput = z.infer<typeof completeOnboardingInput>;
