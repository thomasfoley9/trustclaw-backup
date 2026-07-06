import { db } from "~/server/clients/db";
import { prepareAgentRun } from "~/server/api/routers/trustclaw/agent/setup";
import { parseAgentError } from "~/server/api/routers/trustclaw/agent/error-parser";
import { computeNextRunSafe } from "~/server/api/routers/trustclaw/agent/tools/cron-utils";
import { stripToolResultEchoes } from "~/server/api/routers/trustclaw/agent/strip-tool-echoes";
import {
  sendTelegramMessage,
  sendTelegramMessageChunked,
} from "~/server/clients/telegram";
import { scheduleNextFire, cancelScheduledFire } from "~/server/clients/qstash";

// One scheduled job = one agent run = one CronRun record. Replaces the old
// per-instance batching, where a single poisoned job took down its batchmates
// and there was no per-job success/failure trail.
//
// Failure posture: never throws. Every exit path releases the job's lock
// (fenced on invocationId) and finalizes the CronRun row.

// A scheduled run that hasn't finished in this long is aborted - unattended
// runs must self-terminate, not discover provider rate limits at 3am. Must
// stay under the execute/qstash routes' maxDuration (800s on Pro w/ Fluid)
// with headroom for finalize + Telegram delivery. Real digest jobs were
// observed getting killed by the previous 240s budget.
const RUN_WALL_CLOCK_MS = 720_000;

// Consecutive failures before the job is disabled and the user is told.
export const AUTO_PAUSE_THRESHOLD = 3;

const RESULT_SNIPPET_CHARS = 500;

interface RunSingleCronJobParams {
  jobId: string;
  // Fencing token - must match the lock written by whoever claimed the job.
  invocationId: string;
  trigger: "schedule" | "manual";
  nowOverride?: string;
}

export async function runSingleCronJob({
  jobId,
  invocationId,
  trigger,
  nowOverride,
}: RunSingleCronJobParams): Promise<void> {
  const now = nowOverride ? new Date(nowOverride) : new Date();

  const job = await db.cronJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      instanceId: true,
      expression: true,
      prompt: true,
      timezone: true,
      enabled: true,
      lockedBy: true,
      consecutiveFailures: true,
      instance: { select: { telegramChatId: true } },
    },
  });
  // Deleted while queued, or claimed by someone else - not ours to run.
  if (job?.lockedBy !== invocationId) return;

  const run = await db.cronRun.create({
    data: {
      jobId: job.id,
      instanceId: job.instanceId,
      status: "running",
      trigger,
    },
    select: { id: true },
  });

  const abort = new AbortController();
  const killTimer = setTimeout(
    () => abort.abort(new Error("Scheduled run exceeded its time budget")),
    RUN_WALL_CLOCK_MS,
  );

  try {
    const prepareResult = await prepareAgentRun({
      instanceId: job.instanceId,
      userMessage: `<scheduled-task>\n${job.prompt}\n</scheduled-task>`,
      source: "cron",
      dedicatedConversationTitle: "Scheduled tasks",
    });
    const { agent, messages, closeMcp } = prepareResult.result;

    let result;
    try {
      result = await agent.generate({
        prompt: messages,
        abortSignal: abort.signal,
      });
    } finally {
      // Aborts and zero-step provider errors never reach onFinish's
      // mcp.close - idempotent, so double-close on the happy path is fine.
      await closeMcp().catch(() => undefined);
    }

    const text = stripToolResultEchoes(result.text);
    await finalizeSuccess({
      job,
      runId: run.id,
      invocationId,
      now,
      resultText: text,
      inputTokens: result.totalUsage.inputTokens ?? 0,
      outputTokens: result.totalUsage.outputTokens ?? 0,
    });

    if (job.instance.telegramChatId && text) {
      await sendTelegramMessageChunked(
        job.instance.telegramChatId,
        text,
      ).catch((error) =>
        console.error("[cron/run] telegram delivery failed:", error),
      );
    }
  } catch (error) {
    console.error(`[cron/run] job ${job.id} failed:`, error);
    await finalizeFailure({
      job,
      runId: run.id,
      invocationId,
      now,
      error: parseAgentError(error),
    }).catch((finalizeError) =>
      // A failed release leaves the job locked until the ~10-min stale-lock
      // reclaim. Log the id so a stuck schedule is diagnosable.
      console.error(
        `[cron/run] finalize failed for job ${job.id} (manual unlock may be needed)`,
        finalizeError,
      ),
    );
  } finally {
    clearTimeout(killTimer);
  }
}

interface FinalizeContext {
  job: {
    id: string;
    instanceId: string;
    expression: string;
    timezone: string;
    // Enabled state at run start. Manual runs on a paused job must not
    // re-arm the schedule or re-send the auto-pause notice.
    enabled: boolean;
    consecutiveFailures: number;
    instance: { telegramChatId: string | null };
  };
  runId: string;
  invocationId: string;
  now: Date;
}

async function finalizeSuccess({
  job,
  runId,
  invocationId,
  now,
  resultText,
  inputTokens,
  outputTokens,
}: FinalizeContext & {
  resultText: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  // A paused job stays paused: no next fire, nextRunAt stays null.
  const nextRunAt = job.enabled
    ? computeNextRunSafe(job.expression, job.timezone)
    : null;

  await db.$transaction([
    db.cronRun.update({
      where: { id: runId },
      data: {
        status: "succeeded",
        finishedAt: new Date(),
        resultText: resultText.slice(0, RESULT_SNIPPET_CHARS) || null,
        inputTokens,
        outputTokens,
      },
    }),
    // Fenced release: only OUR lock gets cleared, so a stale run that was
    // reclaimed can't stomp its successor's state.
    db.cronJob.updateMany({
      where: { id: job.id, lockedBy: invocationId },
      data: {
        lastRunAt: now,
        nextRunAt,
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        consecutiveFailures: 0,
      },
    }),
  ]);

  if (job.enabled) {
    await scheduleNextFire(job.id, nextRunAt);
  }
}

async function finalizeFailure({
  job,
  runId,
  invocationId,
  now,
  error,
}: FinalizeContext & { error: string }): Promise<void> {
  const failures = job.consecutiveFailures + 1;
  // Auto-pause only fires on the enabled -> paused transition. A manual run
  // on an already-paused job must not re-send the notice or touch QStash.
  const autoPause = job.enabled && failures >= AUTO_PAUSE_THRESHOLD;
  const nextRunAt =
    job.enabled && !autoPause
      ? computeNextRunSafe(job.expression, job.timezone)
      : null;

  await db.$transaction([
    db.cronRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        finishedAt: new Date(),
        error: error.slice(0, 1000),
      },
    }),
    db.cronJob.updateMany({
      where: { id: job.id, lockedBy: invocationId },
      data: {
        lastRunAt: now,
        nextRunAt,
        lockedAt: null,
        lockedBy: null,
        lastError: error.slice(0, 1000),
        consecutiveFailures: failures,
        ...(autoPause ? { enabled: false } : {}),
      },
    }),
  ]);

  if (autoPause) {
    await cancelScheduledFire(job.id).catch(() => undefined);
    if (job.instance.telegramChatId) {
      await sendTelegramMessage(
        job.instance.telegramChatId,
        `A scheduled task failed ${AUTO_PAUSE_THRESHOLD} times in a row and has been paused. Last error: ${error.slice(0, 300)}\n\nFix it in Settings > Scheduled tasks and flip it back on.`,
      ).catch(() => undefined);
    }
  } else if (job.enabled) {
    await scheduleNextFire(job.id, nextRunAt);
  }
}
