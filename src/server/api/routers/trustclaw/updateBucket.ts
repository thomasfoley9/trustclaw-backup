import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { updateBucketInput } from "./updateBucket.schema";

// Slug is intentionally NOT editable - it's the stable key stored on every
// memory in the bucket. Only the label/description/alwaysInject change.
export const updateBucket = protectedProcedure
  .input(updateBucketInput)
  .mutation(async ({ ctx, input }) => {
    const instance = await db.composioClawInstance.findUnique({
      where: { userId: ctx.session.user.id },
      select: { id: true },
    });
    if (!instance) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found" });
    }

    const bucket = await db.memoryBucket.findFirst({
      where: { id: input.id, instanceId: instance.id },
      select: { id: true },
    });
    if (!bucket) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Bucket not found" });
    }

    return db.memoryBucket.update({
      where: { id: bucket.id },
      data: {
        ...(input.label !== undefined && { label: input.label }),
        ...(input.description !== undefined && {
          description: input.description ?? null,
        }),
        ...(input.alwaysInject !== undefined && {
          alwaysInject: input.alwaysInject,
        }),
      },
      select: {
        id: true,
        slug: true,
        label: true,
        description: true,
        alwaysInject: true,
        isSystem: true,
      },
    });
  });
