import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { generateImage, gateway, zodSchema } from "ai";
import type { Tool } from "ai";
import {
  generateImageSchema,
  type GenerateImageInput,
} from "./generate-image.schema";

const IMAGE_MODEL = "openai/gpt-image-1";

// Images are written to a runtime dir and served via /api/image/[id]. We do NOT
// write to public/ because `next start` only serves public/ files that existed
// at build time. We return only the URL (never base64/bytes) so a multi-MB
// image never enters the conversation context and blows the token budget.
export const GENERATED_IMAGES_DIR = path.join(
  process.cwd(),
  ".generated-images",
);
export function createGenerateImageTool(): Tool<
  GenerateImageInput,
  { url: string; prompt: string } | { error: string }
> {
  return {
    description:
      "Generate an image from a text prompt. Returns a URL to the generated image, which is displayed inline in the chat.",
    inputSchema: zodSchema(generateImageSchema),
    execute: async ({ prompt, size }) => {
      try {
        const { image } = await generateImage({
          model: gateway.imageModel(IMAGE_MODEL),
          prompt,
          size: size ?? "1024x1024",
        });

        const id = crypto.randomUUID();
        await mkdir(GENERATED_IMAGES_DIR, { recursive: true });
        await writeFile(
          path.join(GENERATED_IMAGES_DIR, `${id}.png`),
          image.uint8Array,
        );

        return { url: `/api/image/${id}`, prompt };
      } catch (error) {
        return {
          error:
            error instanceof Error
              ? error.message
              : "Image generation failed",
        };
      }
    },
  };
}
