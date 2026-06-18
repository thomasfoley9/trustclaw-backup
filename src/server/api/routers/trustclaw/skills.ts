import { z } from "zod";

export const skillNameSchema = z.string().trim().min(1).max(60);
export const whenToUseSchema = z.string().trim().min(1).max(300);
export const instructionsSchema = z
  .array(z.string().trim().min(1).max(1000))
  .min(1)
  .max(30);
export const requiredInputsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(60),
      description: z.string().trim().min(1).max(200),
    }),
  )
  .max(20);

export type RequiredInput = z.infer<typeof requiredInputsSchema>[number];

export type SkillForPrompt = {
  name: string;
  whenToUse: string;
  instructions: string[];
  requiredInputs: RequiredInput[];
};

// Pure renderer: turns the enabled skills into the "## Skills" system-prompt
// section. The header carries the standing rule to gather missing inputs
// before acting, so it applies to every skill at once.
export function renderSkillsSection(skills: SkillForPrompt[]): string {
  if (skills.length === 0) return "";

  const header =
    "## Skills\n\n" +
    "You can perform these named skills. Before executing ANY skill, make sure you have every required input — " +
    "if one is missing, ASK the human for it and wait for their answer before acting. Never invent or assume a required input.";

  const body = skills
    .map((s) => {
      const steps = s.instructions.map((i, n) => `${n + 1}. ${i}`).join("\n");
      const inputs =
        s.requiredInputs.length > 0
          ? s.requiredInputs.map((r) => `- ${r.name}: ${r.description}`).join("\n")
          : "- (none)";
      return `### ${s.name}\nWhen to use: ${s.whenToUse}\nSteps:\n${steps}\nRequired inputs:\n${inputs}`;
    })
    .join("\n\n");

  return `${header}\n\n${body}`;
}
