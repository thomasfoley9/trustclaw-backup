import { z } from "zod";

export const getHistoryInput = z.object({
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().datetime().optional(),
  // When provided, loads this conversation instead of the active one. Lets the
  // client key the query by session so switching doesn't show stale messages.
  conversationId: z.string().optional(),
});

export type GetHistoryInput = z.infer<typeof getHistoryInput>;
