import { z } from "zod";

export const addMcpServerInput = z.object({
  label: z.string().trim().min(1, "Add a label").max(60),
  url: z
    .string()
    .trim()
    .url("Enter a valid URL")
    .refine((u) => u.startsWith("https://"), "MCP URL must start with https://"),
});

export type AddMcpServerInput = z.infer<typeof addMcpServerInput>;
