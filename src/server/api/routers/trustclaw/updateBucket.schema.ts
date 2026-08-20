import { z } from "zod";

export const updateBucketInput = z.object({
  id: z.string(),
  label: z.string().trim().min(1).max(40).optional(),
  description: z.string().trim().max(200).nullable().optional(),
  alwaysInject: z.boolean().optional(),
});

export type UpdateBucketInput = z.infer<typeof updateBucketInput>;
