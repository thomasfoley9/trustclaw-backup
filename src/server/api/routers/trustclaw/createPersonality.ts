import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { createPersonalityInput } from "./createPersonality.schema";

export const createPersonality = protectedProcedure
  .input(createPersonalityInput)
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const instance = await db.composioClawInstance.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!instance) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found" });
    }

    const existing = await db.personality.findFirst({
      where: { instanceId: instance.id, name: input.name },
      select: { id: true },
    });
    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "A personality with that name already exists",
      });
    }

    return db.personality.create({
      data: {
        instanceId: instance.id,
        name: input.name,
        prompt: input.prompt,
        emoji: input.emoji,
        avatarKey: input.avatarKey,
        isPreset: false,
      },
      select: {
        id: true,
        name: true,
        emoji: true,
        avatarKey: true,
        prompt: true,
        isPreset: true,
      },
    });
  });
