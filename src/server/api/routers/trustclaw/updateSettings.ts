import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { updateSettingsInput } from "./updateSettings.schema";
import { ALLOWED_ANTHROPIC_MODELS } from "./createInstance.schema";
import { isHouseModel } from "./agent/resolve-model";

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
        message: "Thomas Claw by Composio instance not found",
      });
    }

    // A non-preset model id must be either a built-in house model or one of the
    // caller's own custom models — don't let a client point the agent at an
    // arbitrary id.
    if (
      input.anthropicModel &&
      !isHouseModel(input.anthropicModel) &&
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

    // Same guard for the Agent A (voice/conversation) model override. A null
    // value clears the override and is always allowed.
    if (
      input.agentAModel &&
      !isHouseModel(input.agentAModel) &&
      !(ALLOWED_ANTHROPIC_MODELS as readonly string[]).includes(
        input.agentAModel,
      )
    ) {
      const owned = await db.customModel.findFirst({
        where: { instanceId: instance.id, modelId: input.agentAModel },
        select: { id: true },
      });
      if (!owned) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That voice model isn't in your custom models.",
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
          ...(input.agentAModel !== undefined && {
            agentAModel: input.agentAModel,
          }),
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
          agentAModel: true,
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
