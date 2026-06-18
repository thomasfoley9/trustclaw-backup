import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { DEFAULT_MEMORY_BUCKET } from "./memory-buckets";

export const deleteBucket = protectedProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const instance = await db.composioClawInstance.findUnique({
      where: { userId: ctx.session.user.id },
      select: { id: true, activeMemoryBucket: true },
    });
    if (!instance) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found" });
    }

    const bucket = await db.memoryBucket.findFirst({
      where: { id: input.id, instanceId: instance.id },
      select: { id: true, slug: true },
    });
    if (!bucket) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Bucket not found" });
    }
    if (bucket.slug === DEFAULT_MEMORY_BUCKET) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "The General bucket is the default and can't be deleted.",
      });
    }

    // Reassign this bucket's memories to General so nothing is orphaned, and
    // reset the active bucket if it was pointing here.
    await db.$transaction([
      db.memory.updateMany({
        where: { instanceId: instance.id, category: bucket.slug },
        data: { category: DEFAULT_MEMORY_BUCKET },
      }),
      ...(instance.activeMemoryBucket === bucket.slug
        ? [
            db.composioClawInstance.update({
              where: { id: instance.id },
              data: { activeMemoryBucket: DEFAULT_MEMORY_BUCKET },
            }),
          ]
        : []),
      db.memoryBucket.delete({ where: { id: bucket.id } }),
    ]);

    return { ok: true as const };
  });
