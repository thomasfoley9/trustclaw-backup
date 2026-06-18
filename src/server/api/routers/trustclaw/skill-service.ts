import { db } from "~/server/clients/db";
import { requiredInputsSchema, type SkillForPrompt } from "./skills";

// requiredInputs is a Json column — parse it into the typed shape at the one
// crossing point. `.catch([])` keeps a malformed row from breaking the prompt.
export async function listInstanceSkills(instanceId: string) {
  const rows = await db.skill.findMany({
    where: { instanceId },
    orderBy: { createdAt: "asc" },
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
  return rows.map((r) => ({
    ...r,
    requiredInputs: requiredInputsSchema.catch([]).parse(r.requiredInputs),
  }));
}

// The enabled skills injected into every turn's system prompt.
export async function getEnabledSkills(
  instanceId: string,
): Promise<SkillForPrompt[]> {
  const rows = await db.skill.findMany({
    where: { instanceId, enabled: true },
    orderBy: { createdAt: "asc" },
    select: {
      name: true,
      whenToUse: true,
      instructions: true,
      requiredInputs: true,
    },
  });
  return rows.map((r) => ({
    name: r.name,
    whenToUse: r.whenToUse,
    instructions: r.instructions,
    requiredInputs: requiredInputsSchema.catch([]).parse(r.requiredInputs),
  }));
}
