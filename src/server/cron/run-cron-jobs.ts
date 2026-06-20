import { Prisma } from "~/generated/prisma/client";
import { db } from "~/server/clients/db";
import { prepareAgentRun } from "~/server/api/routers/trustclaw/agent/setup";
import { computeNextRunSafe } from "~/server/api/routers/trustclaw/agent/tools/cron-utils";
import { stripToolResultEchoes } from "~/server/api/routers/trustclaw/agent/strip-tool-echoes";
import { sendTelegramMessage } from "~/server/clients/telegram";
import type { CronJobRow } from "~/app/api/cron/trustclaw/execute/route.schema";

// Shared cron executor. Called by the cron /execute route inline (via after())
// when the worker queue is disabled, and by the standalone worker when it's
// enabled. Identical logic either way — only WHERE it runs differs.

async function releaseJobLocks(
  jobs: CronJobRow[],
  invocationId: string,
  now: Date,
  error?: string,
) {
  const values = jobs.map((job) => {
    const nextRunAt = computeNextRunSafe(job.expression, job.timezone);
    return nextRunAt
      ? Prisma.sql`(${job.id}, ${nextRunAt}::timestamptz)`
      : Prisma.sql`(${job.id}, NULL::timestamptz)`;
  });

  await db.$queryRaw`
    UPDATE composio_claw_cron_job AS cj
    SET
      "lastRunAt" = CASE WHEN ${error ?? null}::text IS NULL THEN ${now}::timestamptz ELSE cj."lastRunAt" END,
      "nextRunAt" = v."nextRunAt"::timestamptz,
      "lockedAt" = NULL,
      "lockedBy" = NULL,
      "lastError" = ${error ?? null}
    FROM (VALUES ${Prisma.join(values)}) AS v(id, "nextRunAt")
    WHERE cj.id = v.id
      AND cj."lockedBy" = ${invocationId}
  `;
}

export async function runCronJobs(
  jobs: CronJobRow[],
  invocationId: string,
  nowOverride?: string,
): Promise<void> {
  const now = nowOverride ? new Date(nowOverride) : new Date();
  const instanceId = jobs[0]!.instanceId;
  const telegramChatId = jobs[0]!.telegramChatId;

  try {
    // Combine all prompts into a single user message
    const combinedMessage = jobs
      .map((j) => `<scheduled-task>\n${j.prompt}\n</scheduled-task>`)
      .join("\n\n");

    // Runs in a dedicated "Scheduled tasks" session so automated turns never
    // land in whatever chat the user has open. The trigger stays visible
    // there (no "hidden" type) so the session reads as a coherent transcript.
    const prepareResult = await prepareAgentRun({
      instanceId,
      userMessage: combinedMessage,
      source: "cron",
      dedicatedConversationTitle: "Scheduled tasks",
    });

    const { agent, messages } = prepareResult.result;

    const result = await agent.generate({ prompt: messages });

    // Release all job locks in a single query (each gets its own nextRunAt)
    await releaseJobLocks(jobs, invocationId, now);

    // Forward to Telegram if linked
    if (telegramChatId) {
      const cleanedText = stripToolResultEchoes(result.text);
      if (cleanedText) {
        const truncated =
          cleanedText.length > 4096
            ? cleanedText.slice(0, 4093) + "..."
            : cleanedText;
        try {
          await sendTelegramMessage(telegramChatId, truncated);
        } catch (error) {
          console.error("[cron/execute] telegram delivery failed:", error);
        }
      }
    }
  } catch (error) {
    console.error("[cron/execute] job execution failed:", error);

    try {
      await releaseJobLocks(
        jobs,
        invocationId,
        now,
        "Scheduled task execution failed",
      );
    } catch (releaseError) {
      console.error("[cron/execute] lock release failed:", releaseError);
    }
  }
}
