import { z } from "zod";
import { zodSchema, embed } from "ai";
import type { Tool } from "ai";
import { db } from "~/server/clients/db";
import { DEFAULT_MEMORY_BUCKET } from "../../memory-buckets";
import {
  memorySearchSchema,
  type MemorySearchInput,
} from "./memory-search.schema";

const memorySearchResultRow = z.object({
  id: z.string(),
  content: z.string(),
  category: z.string(),
  similarity: z.number(),
});

const memoryContextRow = z.object({
  content: z.string(),
  similarity: z.number(),
});

// PERF (deferred, needs an operator with DB access): the HNSW index
// (composio_claw_memory_embedding_hnsw_idx) may never be chosen by the planner
// for the searches below - the selective `"instanceId" = $1` prefilter likely
// makes a filtered sequential/index scan cheaper than an approximate HNSW walk
// over ALL instances' vectors, in which case the index is pure write overhead.
// Verify before touching it:
//   EXPLAIN ANALYZE
//   SELECT id FROM composio_claw_memory
//   WHERE "instanceId" = '<some-real-instance-id>'
//   ORDER BY embedding <=> '<1024-dim-vector>'::vector
//   LIMIT 5;
// If the plan shows no "Index Scan using composio_claw_memory_embedding_hnsw_idx",
// the index is unused for the app's only vector query shape and can be dropped.
async function embedQuery(query: string): Promise<string> {
  const { embedding } = await embed({
    model: "openai/text-embedding-3-large",
    value: query.slice(0, 8000),
    providerOptions: {
      openai: { dimensions: 1024 },
    },
  });
  // Guard the ::vector cast against a wrong-sized / non-finite embedding.
  if (embedding.length !== 1024 || !embedding.every((n) => Number.isFinite(n))) {
    throw new Error(
      `unexpected embedding (${embedding.length} dims / non-finite values)`,
    );
  }
  return `[${embedding.join(",")}]`;
}

export function createMemorySearchTool(
  instanceId: string,
  activeBucket: string = DEFAULT_MEMORY_BUCKET,
): Tool<
  MemorySearchInput,
  {
    found: boolean;
    memories: Array<{ content: string; category: string; relevance: number }>;
  }
> {
  return {
    description: "Search your memory for relevant past information",
    inputSchema: zodSchema(memorySearchSchema),
    execute: async ({ query, maxResults, category }) => {
      try {
        const limit = maxResults ?? 5;
        const embeddingString = await embedQuery(query);

        // A specific category restricts to that bucket; otherwise scope to the
        // active bucket plus the shared `general` bucket.
        const rows = category?.trim()
          ? await db.$queryRaw`
              SELECT id, content, category, 1 - (embedding <=> ${embeddingString}::vector) AS similarity
              FROM composio_claw_memory
              WHERE "instanceId" = ${instanceId} AND category = ${category.trim()}
              ORDER BY embedding <=> ${embeddingString}::vector
              LIMIT ${limit}
            `
          : await db.$queryRaw`
              SELECT id, content, category, 1 - (embedding <=> ${embeddingString}::vector) AS similarity
              FROM composio_claw_memory
              WHERE "instanceId" = ${instanceId}
                AND (category = ${activeBucket} OR category = ${DEFAULT_MEMORY_BUCKET})
              ORDER BY embedding <=> ${embeddingString}::vector
              LIMIT ${limit}
            `;

        const results = z.array(memorySearchResultRow).parse(rows);
        const filtered = results.filter((r) => r.similarity > 0.5);

        return {
          found: filtered.length > 0,
          memories: filtered.map((r) => ({
            content: r.content,
            category: r.category,
            relevance: Math.round(r.similarity * 100) / 100,
          })),
        };
      } catch (err) {
        // A memory lookup failing shouldn't crash the turn - return nothing.
        console.error(
          "[memory_search] failed",
          err instanceof Error ? err.message : err,
        );
        return { found: false, memories: [] };
      }
    },
  };
}

// Fetch the most recent memories in a bucket without similarity ranking.
// Used for always-inject buckets (e.g. curated product knowledge) that should
// be present in context every turn regardless of the current message.
export async function getBucketMemories(
  instanceId: string,
  category: string,
  limit = 25,
): Promise<string[]> {
  try {
    const rows = await db.memory.findMany({
      where: { instanceId, category },
      select: { content: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((r) => r.content);
  } catch {
    return [];
  }
}

export async function searchMemoriesForContext(
  instanceId: string,
  query: string,
  activeBucket: string = DEFAULT_MEMORY_BUCKET,
  maxResults = 5,
): Promise<string[]> {
  try {
    // Skip the embedding round-trip entirely when there's nothing to recall -
    // avoids a gateway call on every turn for buckets with no memories yet.
    const count = await db.memory.count({
      where: {
        instanceId,
        category: { in: [activeBucket, DEFAULT_MEMORY_BUCKET] },
      },
    });
    if (count === 0) return [];

    const embeddingString = await embedQuery(query);

    const results = z.array(memoryContextRow).parse(
      await db.$queryRaw`
        SELECT content, 1 - (embedding <=> ${embeddingString}::vector) AS similarity
        FROM composio_claw_memory
        WHERE "instanceId" = ${instanceId}
          AND (category = ${activeBucket} OR category = ${DEFAULT_MEMORY_BUCKET})
        ORDER BY embedding <=> ${embeddingString}::vector
        LIMIT ${maxResults}
      `,
    );

    return results.filter((r) => r.similarity > 0.5).map((r) => r.content);
  } catch {
    return [];
  }
}
