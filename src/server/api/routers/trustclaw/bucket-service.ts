import { db } from "~/server/clients/db";
import { SEED_BUCKETS } from "./memory-buckets";

// Seed the master buckets for an instance the first time they're needed.
// Idempotent: a no-op once any bucket row exists.
export async function ensureBucketsSeeded(instanceId: string): Promise<void> {
  const count = await db.memoryBucket.count({ where: { instanceId } });
  if (count > 0) return;
  await db.memoryBucket.createMany({
    data: SEED_BUCKETS.map((b) => ({
      instanceId,
      slug: b.slug,
      label: b.label,
      description: b.description,
      alwaysInject: b.alwaysInject,
      isSystem: true,
    })),
    skipDuplicates: true,
  });
}

export async function listInstanceBuckets(instanceId: string) {
  await ensureBucketsSeeded(instanceId);
  return db.memoryBucket.findMany({
    where: { instanceId },
    orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      slug: true,
      label: true,
      description: true,
      alwaysInject: true,
      isSystem: true,
    },
  });
}

// Slugs of buckets whose memories are injected into every turn's context.
export async function getAlwaysInjectBucketSlugs(
  instanceId: string,
): Promise<string[]> {
  await ensureBucketsSeeded(instanceId);
  const rows = await db.memoryBucket.findMany({
    where: { instanceId, alwaysInject: true },
    select: { slug: true },
  });
  return rows.map((r) => r.slug);
}
