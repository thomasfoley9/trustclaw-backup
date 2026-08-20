import { z } from "zod";

export const runCronJobNowInput = z.object({
  jobId: z.string(),
});

export type RunCronJobNowInput = z.infer<typeof runCronJobNowInput>;
