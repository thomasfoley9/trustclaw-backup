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
export function createGenerateImageTool(
  instanceId: string,
): Tool<
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

        // Per-instance subdirectory: the serving route only reads from the
        // requesting user's own directory, so users can't fetch each other's
        // generated images.
        const id = crypto.randomUUID();
        const dir = path.join(GENERATED_IMAGES_DIR, instanceId);
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, `${id}.png`), image.uint8Array);

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
