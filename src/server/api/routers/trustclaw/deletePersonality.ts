import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { deletePersonalityInput } from "./deletePersonality.schema";

export const deletePersonality = protectedProcedure
  .input(deletePersonalityInput)
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const instance = await db.composioClawInstance.findUnique({
      where: { userId },
      select: { id: true, activePersonalityId: true },
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

    // Atomic: clear the active pointer (if it was this one) and delete together,
    // so a reader can't observe activePersonalityId pointing at a deleted row.
    await db.$transaction(async (tx) => {
      if (instance.activePersonalityId === personality.id) {
        await tx.composioClawInstance.update({
          where: { id: instance.id },
          data: { activePersonalityId: null },
        });
      }
      await tx.personality.delete({ where: { id: personality.id } });
    });

    return { id: personality.id };
  });
