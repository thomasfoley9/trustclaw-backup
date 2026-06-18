import { z } from "zod";

// The default/fallback bucket. Always present, can't be deleted, and is
// included in every recall alongside the active bucket.
export const DEFAULT_MEMORY_BUCKET = "general";

export const memoryBucketSchema = z.string().min(1).max(40);

export type BucketSeed = {
  slug: string;
  label: string;
  description: string;
  alwaysInject: boolean;
};

// Seeded per instance on first use. "product" is always-injected (curated
// knowledge that behaves like a skill); the rest are similarity-recalled.
export const SEED_BUCKETS: BucketSeed[] = [
  {
    slug: "general",
    label: "General",
    description: "Everyday context and catch-all memory",
    alwaysInject: false,
  },
  {
    slug: "product",
    label: "Product knowledge",
    description: "Curated facts about the product, like a skill",
    alwaysInject: true,
  },
  {
    slug: "sales",
    label: "Sales",
    description: "Calls, deals, and pipeline context",
    alwaysInject: false,
  },
  {
    slug: "personal",
    label: "Personal",
    description: "Personal life, preferences, and people",
    alwaysInject: false,
  },
];

// Turn a label into a stable slug (lowercase, alphanumeric + dashes).
export function slugifyBucket(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
