import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { listInstanceBuckets } from "./bucket-service";

export const getBuckets = protectedProcedure.query(async ({ ctx }) => {
  const instance = await db.composioClawInstance.findUnique({
    where: { userId: ctx.session.user.id },
    select: { id: true },
  });
  if (!instance) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found" });
  }
  return { buckets: await listInstanceBuckets(instance.id) };
});
