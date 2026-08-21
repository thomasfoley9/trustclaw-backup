import { db } from "~/server/clients/db";
import { computeNextRunSafe } from "~/server/api/routers/trustclaw/agent/tools/cron-utils";
import { EA_CONFIG } from "./config";

// EA system jobs. Exactly one agent-run cron exists (the daily brief, which
// composes prose); the chase sweep and prep lookahead are deterministic code
// on the sweeper path, never cron prompts. Jobs are keyed by systemKind so
// enable/disable is idempotent.

export const EA_BRIEF_SYSTEM_KIND = "ea_brief";

const EA_BRIEF_PROMPT = [
  "Compose the daily chief-of-staff brief. Work strictly from real data:",
  "1. Call ea_task with action list, filter due, then filter open.",
  "2. Read today's calendar (all events today in the user's timezone).",
  "3. Compose the brief with these sections, skipping any that are empty:",
  "   - Needs you today: due and overdue tasks, one line each with their T-id.",
  "   - Dropped balls: tasks from email chases. Mark anything at escalation rung 2 or higher as '2nd ask' or '3rd ask'.",
  "   - Drafts ready: tasks that have a draft attached, with the reply hint (send-ready T-n).",
  "   - Today's calls: each meeting with time and a one-line who/why. Note any that have a Prep task open.",
  "If there is genuinely nothing, the entire brief is one line: 'All clear. Nothing due, nothing dropped.'",
  "Style: concise, friendly, no em dashes, no filler, phone-screen length. Output ONLY the brief text.",
].join("\n");

export async function seedEaSystemJobs(
  instanceId: string,
  timezone: string = EA_CONFIG.timezone,
): Promise<void> {
  const existing = await db.cronJob.findFirst({
    where: { instanceId, systemKind: EA_BRIEF_SYSTEM_KIND },
    select: { id: true, enabled: true },
  });

  if (existing) {
    if (!existing.enabled) {
      await db.cronJob.update({
        where: { id: existing.id },
        data: {
          enabled: true,
          consecutiveFailures: 0,
          nextRunAt: computeNextRunSafe(EA_CONFIG.briefCron, timezone),
        },
      });
    }
    return;
  }

  await db.cronJob.create({
    data: {
      instanceId,
      systemKind: EA_BRIEF_SYSTEM_KIND,
      expression: EA_CONFIG.briefCron,
      timezone,
      prompt: EA_BRIEF_PROMPT,
      enabled: true,
      nextRunAt: computeNextRunSafe(EA_CONFIG.briefCron, timezone),
    },
  });
}

export async function disableEaSystemJobs(instanceId: string): Promise<void> {
  await db.cronJob.updateMany({
    where: { instanceId, systemKind: { not: null } },
    data: { enabled: false, nextRunAt: null },
  });
}
