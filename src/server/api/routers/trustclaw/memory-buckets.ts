import { z } from "zod";

export const DEFAULT_MEMORY_BUCKET = "general";

// Buckets whose memories are ALWAYS injected into context (curated knowledge
// that should behave like a skill), regardless of similarity or active bucket.
export const ALWAYS_INJECT_BUCKETS = ["product"] as const;

export const MEMORY_BUCKET_OPTIONS = [
  {
    value: "general",
    label: "General",
    description: "Everyday context and catch-all memory",
  },
  {
    value: "product",
    label: "Product knowledge",
    description: "Curated facts about the product, like a skill",
  },
  {
    value: "sales",
    label: "Sales",
    description: "Calls, deals, and pipeline context",
  },
  {
    value: "personal",
    label: "Personal",
    description: "Personal life, preferences, and people",
  },
] as const;

export const memoryBucketSchema = z.string().min(1).max(40);

export type MemoryBucketOption = (typeof MEMORY_BUCKET_OPTIONS)[number];
