import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { updateSettingsInput } from "./updateSettings.schema";

export const updateSettings = protectedProcedure
  .input(updateSettingsInput)
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const instance = await db.composioClawInstance.findUnique({
      where: { userId },
    });

    if (!instance) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "TrustClaw by Composio instance not found",
      });
    }

    // Don't let a client point activePersonalityId at a personality that
    // isn't theirs (or doesn't exist).
    if (input.activePersonalityId) {
      const owned = await db.personality.findFirst({
        where: { id: input.activePersonalityId, instanceId: instance.id },
        select: { id: true },
      });
      if (!owned) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Personality not found",
        });
      }
    }

    const [updated] = await db.$transaction([
      db.composioClawInstance.update({
        where: { userId },
        data: {
          ...(input.anthropicModel && { anthropicModel: input.anthropicModel }),
          ...(input.activeMemoryBucket && {
            activeMemoryBucket: input.activeMemoryBucket,
          }),
          ...(input.incognitoMode !== undefined && {
            incognitoMode: input.incognitoMode,
          }),
          ...(input.activePersonalityId !== undefined && {
            activePersonalityId: input.activePersonalityId,
          }),
        },
        select: {
          id: true,
          anthropicModel: true,
          activeMemoryBucket: true,
          incognitoMode: true,
          activePersonalityId: true,
          updatedAt: true,
        },
      }),
      ...(input.timezone
        ? [db.user.update({ where: { id: userId }, data: { timezone: input.timezone } })]
        : []),
    ]);

    return updated;
  });
