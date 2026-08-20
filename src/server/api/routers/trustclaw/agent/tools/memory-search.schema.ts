import { z } from "zod";

export const memorySearchSchema = z.object({
  query: z.string().describe("What to search for in memory"),
  maxResults: z
    .number()
    .optional()
    .describe("Maximum number of results to return (defaults to 5)"),
  category: z
    .string()
    .optional()
    .describe(
      "Optional bucket to restrict the search to (e.g. general, product, sales, personal). Defaults to the active bucket plus general.",
    ),
});

export type MemorySearchInput = z.infer<typeof memorySearchSchema>;
