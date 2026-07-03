import { TRPCError } from "@trpc/server";
import { Prisma } from "~/generated/prisma/client";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { ensureBucketsSeeded } from "./bucket-service";
import { slugifyBucket } from "./memory-buckets";
import { createBucketInput } from "./createBucket.schema";

export const createBucket = protectedProcedure
  .input(createBucketInput)
  .mutation(async ({ ctx, input }) => {
    const instance = await db.composioClawInstance.findUnique({
      where: { userId: ctx.session.user.id },
      select: { id: true },
    });
    if (!instance) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found" });
    }
    await ensureBucketsSeeded(instance.id);

    const slug = slugifyBucket(input.label);
    if (!slug) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Give the bucket a name with at least one letter or number.",
      });
    }

    const existing = await db.memoryBucket.findUnique({
      where: { instanceId_slug: { instanceId: instance.id, slug } },
      select: { id: true },
    });
    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `A bucket named "${input.label}" already exists.`,
      });
    }

    try {
      return await db.memoryBucket.create({
        data: {
          instanceId: instance.id,
          slug,
          label: input.label,
          description: input.description ?? null,
          alwaysInject: input.alwaysInject,
          isSystem: false,
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
    } catch (err) {
      // Check-then-create race: a concurrent create with the same slug lands
      // here as a unique violation — surface it as the same friendly CONFLICT.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A bucket named "${input.label}" already exists.`,
        });
      }
      throw err;
    }
  });
