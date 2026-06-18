import { z } from "zod";

export const createBucketInput = z.object({
  label: z.string().trim().min(1).max(40),
  description: z.string().trim().max(200).optional(),
  alwaysInject: z.boolean().default(false),
});

export type CreateBucketInput = z.infer<typeof createBucketInput>;
