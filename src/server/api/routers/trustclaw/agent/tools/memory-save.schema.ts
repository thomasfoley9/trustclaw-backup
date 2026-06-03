import { z } from "zod";

export const memorySaveSchema = z.object({
  content: z.string().describe("The fact or observation to remember"),
  category: z
    .string()
    .optional()
    .describe(
      "Optional memory bucket to store this in (e.g. general, product, sales, personal). Defaults to the active bucket.",
    ),
});

export type MemorySaveInput = z.infer<typeof memorySaveSchema>;
