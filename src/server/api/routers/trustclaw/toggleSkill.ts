import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { toggleSkillInput } from "./toggleSkill.schema";

export const toggleSkill = protectedProcedure
  .input(toggleSkillInput)
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

    return db.skill.update({
      where: { id: skill.id },
      data: { enabled: input.enabled },
      select: { id: true, enabled: true },
    });
  });
