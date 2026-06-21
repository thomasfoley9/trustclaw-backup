import { TRPCError } from "@trpc/server";
import { Prisma } from "~/generated/prisma/client";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { updatePersonalityInput } from "./updatePersonality.schema";

export const updatePersonality = protectedProcedure
  .input(updatePersonalityInput)
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const instance = await db.composioClawInstance.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!instance) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found" });
    }

    const personality = await db.personality.findFirst({
      where: { id: input.id, instanceId: instance.id },
      select: { id: true },
    });
    if (!personality) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Personality not found",
      });
    }

    if (input.name !== undefined) {
      const clash = await db.personality.findFirst({
        where: {
          instanceId: instance.id,
          name: input.name,
          id: { not: personality.id },
        },
        select: { id: true },
      });
      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A personality with that name already exists",
        });
      }
    }

    try {
      return await db.personality.update({
        where: { id: personality.id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.prompt !== undefined && { prompt: input.prompt }),
          ...(input.emoji !== undefined && { emoji: input.emoji }),
          ...(input.avatarKey !== undefined && { avatarKey: input.avatarKey }),
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
    } catch (err) {
      // Backstop for the rename race the clash check above can't fully close.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A personality with that name already exists",
        });
      }
      throw err;
    }
  });
