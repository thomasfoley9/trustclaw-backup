-- HNSW approximate-nearest-neighbor index for memory vector search.
-- The embedding column is Unsupported("VECTOR(1024)") in the Prisma schema, so
-- pgvector indexes can't be expressed via @@index and live here as raw SQL.
-- vector_cosine_ops matches the `<=>` cosine operator used by memory-search.ts.
CREATE INDEX IF NOT EXISTS "composio_claw_memory_embedding_hnsw_idx"
  ON "composio_claw_memory"
  USING hnsw (embedding vector_cosine_ops);
