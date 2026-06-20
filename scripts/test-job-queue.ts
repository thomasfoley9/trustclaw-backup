/* eslint-disable no-console -- standalone integration test script */
//
// Integration test for the BullMQ agent job-queue seam (src/server/clients/
// job-queue.ts). Runs against a REAL Redis — no mocks — so the BullMQ wiring,
// idempotency, and payload shape are exercised exactly as in production.
//
// Run:
//   docker run -d --name tc-redis -p 6399:6379 redis:7-alpine
//   SKIP_ENV_VALIDATION=1 REDIS_URL=redis://localhost:6399 \
//     pnpm exec tsx scripts/test-job-queue.ts
//
import assert from "node:assert/strict";
import {
  enqueueAgentJob,
  getAgentQueue,
  createAgentWorker,
  type AgentJobData,
} from "~/server/clients/job-queue";

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout: ${label} (${ms}ms)`)), ms),
    ),
  ]);
}

async function main() {
  const queue = getAgentQueue();
  assert(queue, "queue must be available when REDIS_URL is set");
  await queue.obliterate({ force: true });

  // === Test A: jobId idempotency + ':' normalization (no worker draining) ===
  const idA = await enqueueAgentJob("sess-1:turn-1", {
    instanceId: "inst-A",
    userId: "user-A",
    userMessage: "first wins",
    source: "web",
  });
  assert.equal(idA, "sess-1_turn-1", "':' must be normalized to '_' for BullMQ");
  await enqueueAgentJob("sess-1:turn-1", {
    instanceId: "inst-A",
    userId: "user-A",
    userMessage: "duplicate — must be ignored",
    source: "web",
  });
  const waiting = await queue.getWaitingCount();
  assert.equal(waiting, 1, `duplicate jobId should yield 1 job, got ${waiting}`);
  const dupJob = await queue.getJob(idA);
  assert.equal(
    dupJob?.data.userMessage,
    "first wins",
    "first enqueue must win; the duplicate is dropped",
  );
  console.log("PASS A — ':' normalized + duplicate jobId deduped");

  // === Test B: enqueue -> worker consume -> data integrity ===
  await queue.obliterate({ force: true });
  const processed: Array<{ id: string; data: AgentJobData }> = [];
  let resolveDone: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));
  const worker = createAgentWorker(async (job) => {
    processed.push({ id: job.id ?? "?", data: job.data });
    resolveDone();
  });

  const idB = await enqueueAgentJob("sess-2:turn-1", {
    instanceId: "inst-B",
    userId: "user-B",
    userMessage: "hello worker",
    source: "web",
    conversationId: "conv-B",
  });
  await withTimeout(done, 8000, "worker consume");

  assert.equal(processed.length, 1, "exactly one job processed");
  assert.equal(processed[0]!.id, idB, "jobId preserved (normalized)");
  assert.equal(processed[0]!.data.instanceId, "inst-B");
  assert.equal(processed[0]!.data.userMessage, "hello worker");
  assert.equal(processed[0]!.data.conversationId, "conv-B");
  console.log("PASS B — enqueue -> consume -> data integrity");

  // === Test C: no secret material on the queue payload ===
  const payloadKeys = Object.keys(processed[0]!.data);
  const leaky = payloadKeys.filter((k) =>
    /key|secret|token|password|apikey/i.test(k),
  );
  assert.equal(
    leaky.length,
    0,
    `queue payload must carry no secrets; found: ${leaky.join(", ")}`,
  );
  console.log("PASS C — queue payload carries no secret material");

  await worker.close();
  await queue.obliterate({ force: true });
  await queue.close();
  console.log("\nAll job-queue integration tests passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
