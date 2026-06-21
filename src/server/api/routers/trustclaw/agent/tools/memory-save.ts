import { zodSchema, embed } from "ai";
import type { Tool } from "ai";
import { db } from "~/server/clients/db";
import { DEFAULT_MEMORY_BUCKET } from "../../memory-buckets";
import { memorySaveSchema, type MemorySaveInput } from "./memory-save.schema";

// Well under text-embedding-3-large's token limit; longer content is truncated
// rather than failing the embed call.
const MAX_CONTENT_CHARS = 8000;
const EMBED_DIMS = 1024;

// Canonical embed+insert for a single memory. Shared by the agent's
// memory_save tool and the "save conversation to bucket" feature so both
// produce identical 1024-dim vectors and rows. May throw (embed gateway / DB) —
// callers decide whether that's fatal.
export async function saveMemory(
  instanceId: string,
  content: string,
  bucketSlug: string,
): Promise<void> {
  const trimmed = content.slice(0, MAX_CONTENT_CHARS);
  const { embedding } = await embed({
    model: "openai/text-embedding-3-large",
    value: trimmed,
    providerOptions: {
      openai: { dimensions: EMBED_DIMS },
    },
  });
  // Guard the ::vector cast — a wrong-sized or non-finite embedding would
  // otherwise corrupt the row or fail the query opaquely.
  if (
    embedding.length !== EMBED_DIMS ||
    !embedding.every((n) => Number.isFinite(n))
  ) {
    throw new Error(
      `unexpected embedding (${embedding.length} dims / non-finite values)`,
    );
  }
  const embeddingString = `[${embedding.join(",")}]`;
  const id = crypto.randomUUID();

  await db.$queryRaw`
    INSERT INTO composio_claw_memory (id, "instanceId", content, category, embedding, "createdAt")
    VALUES (${id}, ${instanceId}, ${trimmed}, ${bucketSlug}, ${embeddingString}::vector, NOW())
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
      // Keep memories in a real bucket — the LLM's category choice may not
      // correspond to an existing one; fall back to the default if so.
      let bucket = category?.trim() ? category.trim() : defaultCategory;
      if (bucket !== defaultCategory) {
        const exists = await db.memoryBucket.findFirst({
          where: { instanceId, slug: bucket },
          select: { id: true },
        });
        if (!exists) bucket = defaultCategory;
      }
      try {
        await saveMemory(instanceId, content, bucket);
        return { saved: true, content, category: bucket };
      } catch (err) {
        // Never crash the agent turn over a memory save — let the model know it
        // didn't land so it can carry on (or retry).
        console.error(
          "[memory_save] failed",
          err instanceof Error ? err.message : err,
        );
        return { saved: false, content, category: bucket };
      }
    },
  };
}
