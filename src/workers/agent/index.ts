/* eslint-disable no-console -- worker process entrypoint; logs to stdout/stderr for the container log stream */
//
// Standalone agent worker (Phase 2). Runs OUTSIDE Vercel - in a long-lived
// container with no function-duration ceiling - consuming the agent-jobs queue
// and driving each run to completion via the portable runAgent(). All
// persistence (assistant row, memory flush, compaction, cleanup) happens inside
// the agent's onFinish, so the worker only needs to invoke runAgent.
//
// Run locally:  SKIP_ENV_VALIDATION=1 REDIS_URL=... pnpm exec tsx src/workers/agent/index.ts
//
import { createAgentWorker } from "~/server/clients/job-queue";
import { runAgent } from "~/server/workers/agent-runner";
import { runSingleCronJob } from "~/server/cron/run-single-job";

const worker = createAgentWorker(async (job) => {
  const data = job.data;
  if (data.kind === "cron") {
    console.log(`[worker] cron job ${job.id} starting (job=${data.jobId})`);
    await runSingleCronJob({
      jobId: data.jobId,
      invocationId: data.invocationId,
      trigger: data.trigger ?? "schedule",
      nowOverride: data.nowOverride,
    });
    return;
  }
  console.log(`[worker] job ${job.id} starting (instance=${data.instanceId})`);
  await runAgent({
    instanceId: data.instanceId,
    userMessage: data.userMessage,
    source: data.source,
    conversationId: data.conversationId,
  });
});

worker.on("completed", (job) => {
  console.log(`[worker] job ${job.id} completed`);
});
worker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id ?? "?"} failed:`, err);
});
worker.on("error", (err) => {
  console.error("[worker] worker error:", err);
});

console.log("[worker] agent worker started - waiting for jobs");

// Graceful shutdown: stop accepting new jobs and let in-flight ones finish
// (within the platform's grace period) before the process exits, so a deploy
// or scale-down can't sever a run mid-tool-call.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received - draining…`);
  try {
    await worker.close();
  } catch (err) {
    console.error("[worker] error during shutdown:", err);
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
