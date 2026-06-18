import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

export const deleteCustomModel = protectedProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const instance = await db.composioClawInstance.findUnique({
      where: { userId: ctx.session.user.id },
      select: { id: true, anthropicModel: true },
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

    // If the agent was pointed at this model, fall back to the default preset
    // so the next run doesn't resolve a now-missing id.
    await db.$transaction([
      ...(instance.anthropicModel === model.modelId
        ? [
            db.composioClawInstance.update({
              where: { id: instance.id },
              data: { anthropicModel: DEFAULT_MODEL },
            }),
          ]
        : []),
      db.customModel.delete({ where: { id: model.id } }),
    ]);

    return { ok: true as const };
  });
