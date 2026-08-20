import { generateImage, gateway, zodSchema } from "ai";
import type { Tool } from "ai";
import { db } from "~/server/clients/db";
import {
  generateImageSchema,
  type GenerateImageInput,
} from "./generate-image.schema";

const IMAGE_MODEL = "openai/gpt-image-1";

// Images are stored in the DB and served via /api/image/[id]. The serverless
// filesystem is read-only (and per-lambda), so a file written here would be
// invisible to the lambda serving the image route. We return only the URL
// (never base64/bytes) so a multi-MB image never enters the conversation
// context and blows the token budget.
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

        // Scoped to the instance: the serving route only reads the requesting
        // user's own rows, so users can't fetch each other's images.
        const row = await db.generatedImage.create({
          data: {
            instanceId,
            mimeType: image.mediaType ?? "image/png",
            data: Buffer.from(image.uint8Array),
          },
          select: { id: true },
        });

        return { url: `/api/image/${row.id}`, prompt };
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
