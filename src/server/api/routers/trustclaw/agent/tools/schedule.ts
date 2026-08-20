import { zodSchema } from "ai";
import type { Tool } from "ai";
import { db } from "~/server/clients/db";
import {
  scheduleNextFire,
  cancelScheduledFire,
} from "~/server/clients/qstash";
import {
  computeNextRunAt,
  validateCronExpression,
  meetsMinInterval,
} from "./cron-utils";
import { scheduleSchema, type ScheduleInput } from "./schedule.schema";

export function createScheduleTool(
  instanceId: string,
  defaultTimezone: string,
): Tool<ScheduleInput, Record<string, unknown>> {
  return {
    description: "Create, list, or delete scheduled tasks",
    inputSchema: zodSchema(scheduleSchema),
    execute: async ({ action, expression, prompt, timezone, jobId }) => {
      const tz = timezone ?? defaultTimezone;

      switch (action) {
        case "create": {
          if (!expression || !prompt) {
            return {
              error:
                "Both 'expression' and 'prompt' are required for create",
            };
          }

          try {
            if (!validateCronExpression(expression)) {
              return { error: "Invalid cron expression" };
            }

            if (!meetsMinInterval(expression, tz)) {
              return {
                error:
                  "Scheduled tasks can run at most once every 15 minutes. Pick a less frequent cadence (for example every 15 or 30 minutes, hourly, or daily).",
              };
            }

            const nextRun = computeNextRunAt(expression, tz);

            const job = await db.cronJob.create({
              data: {
                instanceId,
                expression,
                prompt,
                timezone: tz,
                nextRunAt: nextRun,
              },
              select: {
                id: true,
                expression: true,
                prompt: true,
                nextRunAt: true,
              },
            });

            // Push scheduling (no-op when QStash is off; the sweeper covers it).
            await scheduleNextFire(job.id, job.nextRunAt);

            return {
              created: true,
              jobId: job.id,
              expression: job.expression,
              prompt: job.prompt,
              nextRunAt: job.nextRunAt?.toISOString(),
            };
          } catch {
            return { error: "Invalid cron expression" };
          }
        }

        case "list": {
          // Paused jobs are included so the agent can report on and delete
          // them - filtering to enabled-only made them invisible.
          const jobs = await db.cronJob.findMany({
            where: { instanceId },
            select: {
              id: true,
              expression: true,
              prompt: true,
              timezone: true,
              enabled: true,
              lastRunAt: true,
              nextRunAt: true,
              lastError: true,
            },
            orderBy: { nextRunAt: "asc" },
          });

          return {
            jobs: jobs.map((j) => ({
              jobId: j.id,
              expression: j.expression,
              prompt: j.prompt,
              timezone: j.timezone,
              enabled: j.enabled,
              lastRunAt: j.lastRunAt?.toISOString() ?? null,
              nextRunAt: j.nextRunAt?.toISOString() ?? null,
              lastError: j.lastError,
            })),
          };
        }

        case "delete": {
          if (!jobId) {
            return { error: "'jobId' is required for delete" };
          }

          const job = await db.cronJob.findFirst({
            where: { id: jobId, instanceId },
          });

          if (!job) {
            return { error: "Job not found" };
          }

          await cancelScheduledFire(jobId).catch(() => undefined);
          await db.cronJob.delete({ where: { id: jobId } });

          return { deleted: true, jobId };
        }
      }
    },
  };
}
