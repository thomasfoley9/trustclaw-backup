import { z } from "zod";

export const executeJobInput = z.object({
  jobId: z.string(),
  invocationId: z.string(),
  trigger: z.enum(["schedule", "manual"]).default("schedule"),
  nowOverride: z.string().datetime().optional(),
});

export type ExecuteJobInput = z.infer<typeof executeJobInput>;

// Payload handed to the standalone worker queue - everything the worker needs
// to run one job without re-querying at dispatch time.
export const cronWorkerPayload = z.object({
  jobId: z.string(),
  invocationId: z.string(),
  trigger: z.enum(["schedule", "manual"]).optional(),
  nowOverride: z.string().datetime().optional(),
});

export type CronWorkerPayload = z.infer<typeof cronWorkerPayload>;
