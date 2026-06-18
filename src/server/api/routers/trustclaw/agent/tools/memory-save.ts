import { zodSchema, embed } from "ai";
import type { Tool } from "ai";
import { db } from "~/server/clients/db";
import { DEFAULT_MEMORY_BUCKET } from "../../memory-buckets";
import { memorySaveSchema, type MemorySaveInput } from "./memory-save.schema";

// Canonical embed+insert for a single memory. Shared by the agent's
// memory_save tool and the "save conversation to bucket" feature so both
// produce identical 1024-dim vectors and rows.
export async function saveMemory(
  instanceId: string,
  content: string,
  bucketSlug: string,
): Promise<void> {
  const { embedding } = await embed({
    model: "openai/text-embedding-3-large",
    value: content,
    providerOptions: {
      openai: { dimensions: 1024 },
    },
  });
  const embeddingString = `[${embedding.join(",")}]`;
  const id = crypto.randomUUID();

  await db.$queryRaw`
    INSERT INTO composio_claw_memory (id, "instanceId", content, category, embedding, "createdAt")
    VALUES (${id}, ${instanceId}, ${content}, ${bucketSlug}, ${embeddingString}::vector, NOW())
  `;
}

export function createMemorySaveTool(
  instanceId: string,
  defaultCategory: string = DEFAULT_MEMORY_BUCKET,
): Tool<MemorySaveInput, { saved: boolean; content: string; category: string }> {
  return {
    description: "Save an important fact or observation for future reference",
    inputSchema: zodSchema(memorySaveSchema),
    execute: async ({ content, category }) => {
      const bucket = category?.trim() ? category.trim() : defaultCategory;
      await saveMemory(instanceId, content, bucket);
      return { saved: true, content, category: bucket };
    },
  };
}
