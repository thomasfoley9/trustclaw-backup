import { TRPCError } from "@trpc/server";
import { Prisma } from "~/generated/prisma/client";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { requiredInputsSchema } from "./skills";
import { updateSkillInput } from "./updateSkill.schema";

export const updateSkill = protectedProcedure
  .input(updateSkillInput)
  .mutation(async ({ ctx, input }) => {
    const instance = await db.composioClawInstance.findUnique({
      where: { userId: ctx.session.user.id },
      select: { id: true },
    });
    if (!instance) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found" });
    }

    const skill = await db.skill.findFirst({
      where: { id: input.id, instanceId: instance.id },
      select: { id: true },
    });
    if (!skill) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });
    }

    if (input.name) {
      const clash = await db.skill.findFirst({
        where: {
          instanceId: instance.id,
          name: input.name,
          id: { not: skill.id },
        },
        select: { id: true },
      });
      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `You already have a skill named "${input.name}".`,
        });
      }
    }

    let updated;
    try {
      updated = await db.skill.update({
        where: { id: skill.id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.whenToUse !== undefined && { whenToUse: input.whenToUse }),
          ...(input.instructions !== undefined && {
            instructions: input.instructions,
          }),
          ...(input.requiredInputs !== undefined && {
            requiredInputs: input.requiredInputs,
          }),
          ...(input.enabled !== undefined && { enabled: input.enabled }),
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
    } catch (err) {
      // Backstop for the rename race the clash check above can't fully close.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: input.name
            ? `You already have a skill named "${input.name}".`
            : "You already have a skill with that name.",
        });
      }
      throw err;
    }
    return {
      ...updated,
      requiredInputs: requiredInputsSchema.catch([]).parse(updated.requiredInputs),
    };
  });
