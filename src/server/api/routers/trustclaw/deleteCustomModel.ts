import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";

const DEFAULT_MODEL = "claude-sonnet-5";

export const deleteCustomModel = protectedProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const instance = await db.composioClawInstance.findUnique({
      where: { userId: ctx.session.user.id },
      select: { id: true, anthropicModel: true, agentAModel: true },
    });
    if (!instance) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found" });
    }

    const model = await db.customModel.findFirst({
      where: { id: input.id, instanceId: instance.id },
      select: { id: true, modelId: true },
    });
    if (!model) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Model not found" });
    }

    // If the agent was pointed at this model - as the main (B) model or the
    // voice-front (A) model - fall back so the next run doesn't resolve a
    // now-missing id and fail with a misleading "add your API key" error.
    const instanceData = {
      ...(instance.anthropicModel === model.modelId
        ? { anthropicModel: DEFAULT_MODEL }
        : {}),
      ...(instance.agentAModel === model.modelId ? { agentAModel: null } : {}),
    };
    await db.$transaction([
      ...(Object.keys(instanceData).length > 0
        ? [
            db.composioClawInstance.update({
              where: { id: instance.id },
              data: instanceData,
            }),
          ]
        : []),
      db.customModel.delete({ where: { id: model.id } }),
    ]);

    return { ok: true as const };
  });
