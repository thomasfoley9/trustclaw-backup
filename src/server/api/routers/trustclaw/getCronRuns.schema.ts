import { z } from "zod";

export const getCronRunsInput = z.object({
  jobId: z.string(),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(50).default(10),
});

export type GetCronRunsInput = z.infer<typeof getCronRunsInput>;
