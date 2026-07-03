import { z } from "zod";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { getStreamingMessage as getStreamingMessageFromRedis } from "~/server/clients/redis";

export const getStreamingMessage = protectedProcedure
  .input(z.object({ conversationId: z.string() }))
  .query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const instance = await db.composioClawInstance.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!instance) return null;

    // Scoped to the conversation the caller is viewing — an instance-wide
    // pointer leaked one conversation's live stream into another's view.
    const messageId = await getStreamingMessageFromRedis(
      instance.id,
      input.conversationId,
    );
    if (!messageId) return null;

    return { messageId };
  });
