import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { requiredInputsSchema } from "./skills";
import { createSkillInput } from "./createSkill.schema";

export const createSkill = protectedProcedure
  .input(createSkillInput)
  .mutation(async ({ ctx, input }) => {
    const instance = await db.composioClawInstance.findUnique({
      where: { userId: ctx.session.user.id },
      select: { id: true },
    });
    if (!instance) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found" });
    }

    const existing = await db.skill.findUnique({
      where: { instanceId_name: { instanceId: instance.id, name: input.name } },
      select: { id: true },
    });
    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `You already have a skill named "${input.name}".`,
      });
    }

    const created = await db.skill.create({
      data: {
        instanceId: instance.id,
        name: input.name,
        whenToUse: input.whenToUse,
        instructions: input.instructions,
        requiredInputs: input.requiredInputs,
        isPreset: false,
      },
      select: {
        id: true,
        name: true,
        whenToUse: true,
        instructions: true,
        requiredInputs: true,
        enabled: true,
        isPreset: true,
      },
    });
    return {
      ...created,
      requiredInputs: requiredInputsSchema.catch([]).parse(created.requiredInputs),
    };
  });
