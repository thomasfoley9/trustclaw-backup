import { z } from "zod";

export const restartOnboardingInput = z.object({}).optional();

export type RestartOnboardingInput = z.infer<typeof restartOnboardingInput>;
