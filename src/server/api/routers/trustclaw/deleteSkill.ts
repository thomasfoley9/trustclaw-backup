import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";

export const deleteSkill = protectedProcedure
  .input(z.object({ id: z.string() }))
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

    await db.skill.delete({ where: { id: skill.id } });
    return { ok: true as const };
  });
