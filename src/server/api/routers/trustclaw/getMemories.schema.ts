import { z } from "zod";

export const getMemoriesInput = z.object({
  // Validated as a datetime so garbage becomes BAD_REQUEST instead of an
  // Invalid Date reaching Prisma (500).
  cursor: z.string().datetime().optional(),
  limit: z.number().min(1).max(100).default(20),
});

export type GetMemoriesInput = z.infer<typeof getMemoriesInput>;

export const memoryRow = z.object({
  id: z.string(),
  content: z.string(),
  category: z.string(),
  createdAt: z.coerce.date(),
});

export type MemoryRow = z.infer<typeof memoryRow>;
