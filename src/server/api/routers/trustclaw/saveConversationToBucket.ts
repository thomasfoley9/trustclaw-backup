import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { reconstructMessages } from "./agent/context/build-context";
import { distillMemoriesFromConversation } from "./agent/compaction/distill-memories";
import { saveMemory } from "./agent/tools/memory-save";
import { ensureBucketsSeeded } from "./bucket-service";
import { saveConversationToBucketInput } from "./saveConversationToBucket.schema";

export const saveConversationToBucket = protectedProcedure
  .input(saveConversationToBucketInput)
  .mutation(async ({ ctx, input }) => {
    const instance = await db.composioClawInstance.findUnique({
      where: { userId: ctx.session.user.id },
      select: { id: true, anthropicModel: true },
    });
    if (!instance) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found" });
    }

    const conversation = await db.conversation.findFirst({
      where: { id: input.conversationId, instanceId: instance.id },
      select: { id: true },
    });
    if (!conversation) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Conversation not found",
      });
    }

    await ensureBucketsSeeded(instance.id);
    const bucket = await db.memoryBucket.findUnique({
      where: {
        instanceId_slug: { instanceId: instance.id, slug: input.bucketSlug },
      },
      select: { slug: true },
    });
    if (!bucket) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "That bucket no longer exists.",
      });
    }

    const rows = await db.message.findMany({
      where: { conversationId: conversation.id, messageType: "regular" },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true },
    });
    if (rows.length === 0) {
      return { savedCount: 0 };
    }

    const messages = reconstructMessages(rows);
    const statements = await distillMemoriesFromConversation(
      instance.id,
      instance.anthropicModel,
      messages,
    );

    // Persist each independently so one embedding failure doesn't discard the
    // rest; report what actually landed rather than throwing after partial work.
    const results = await Promise.allSettled(
      statements.map((statement) =>
        saveMemory(instance.id, statement, bucket.slug),
      ),
    );
    const savedCount = results.filter((r) => r.status === "fulfilled").length;

    return { savedCount };
  });
