import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { updateSettingsInput } from "./updateSettings.schema";
import { ALLOWED_ANTHROPIC_MODELS } from "./createInstance.schema";

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

    // A non-preset model id must correspond to one of the caller's own
    // custom models — don't let a client point the agent at an arbitrary id.
    if (
      input.anthropicModel &&
      !(ALLOWED_ANTHROPIC_MODELS as readonly string[]).includes(
        input.anthropicModel,
      )
    ) {
      const owned = await db.customModel.findFirst({
        where: { instanceId: instance.id, modelId: input.anthropicModel },
        select: { id: true },
      });
      if (!owned) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That model isn't in your custom models.",
        });
      }
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
