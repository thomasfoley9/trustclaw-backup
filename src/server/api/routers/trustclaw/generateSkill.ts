import { generateObject } from "ai";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";
import { resolveAgentModel } from "./agent/resolve-model";
import { sanitizeString } from "./agent/context/build-context";
import { generateSkillInput, skillDraftSchema } from "./generateSkill.schema";

const SKILL_DRAFTING_SYSTEM =
  "You turn a user's plain-English description into a structured, reusable agent skill.\n\n" +
  "Produce: a short imperative name; a 'whenToUse' line describing the trigger/intent; an ordered list of concrete instruction steps the agent follows; and the requiredInputs the agent must collect from the human before performing the skill (each with a short name and a description of what it is). " +
  "Infer sensible required inputs from the description — anything the steps need that the user would have to provide (names, amounts, dates, recipients, etc.). If the skill needs no inputs, return an empty requiredInputs array. " +
  "Keep instructions clear and self-contained. Do not invent external integrations that weren't implied.";

export const generateSkill = protectedProcedure
  .input(generateSkillInput)
  .mutation(async ({ ctx, input }) => {
    const instance = await db.composioClawInstance.findUnique({
      where: { userId: ctx.session.user.id },
      select: { id: true, anthropicModel: true },
    });
    if (!instance) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found" });
    }

    const model = await resolveAgentModel(instance.id, instance.anthropicModel);

    try {
      const { object } = await generateObject({
        model,
        schema: skillDraftSchema,
        system: SKILL_DRAFTING_SYSTEM,
        prompt: sanitizeString(input.description),
        maxOutputTokens: 2_000,
      });
      return object;
    } catch {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Couldn't draft a skill from that — try rephrasing.",
      });
    }
  });
