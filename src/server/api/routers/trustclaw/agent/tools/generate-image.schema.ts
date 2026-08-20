import { z } from "zod";

export const generateImageSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .max(2000)
    .describe("Detailed description of the image to generate"),
  size: z
    .enum(["1024x1024", "1536x1024", "1024x1536"])
    .optional()
    .describe(
      "Image dimensions: 1024x1024 (square, default), 1536x1024 (landscape), 1024x1536 (portrait)",
    ),
});

export type GenerateImageInput = z.infer<typeof generateImageSchema>;
