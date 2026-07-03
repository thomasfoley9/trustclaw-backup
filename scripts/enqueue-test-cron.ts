/* eslint-disable no-console -- local end-to-end test helper (not shipped) */
//
// Enqueues one cron job onto the queue, exactly as the cron /execute route
// does when WORKER_QUEUE_ENABLED=true. Reads the seeded job from the env.
//
// NOTE: the worker validates the fencing token, so the seeded job's lockedBy
// must be "inv-test" for the run to proceed (see run-single-job.ts).
//
import { enqueueCronJob } from "~/server/clients/job-queue";

async function main() {
  const cronJobId = process.env.TEST_CRON_JOB_ID;
  if (!cronJobId) {
    throw new Error("set TEST_CRON_JOB_ID");
  }
  const id = await enqueueCronJob(`cron:inv-test:${cronJobId}`, {
    jobId: cronJobId,
    invocationId: "inv-test",
  });
  console.log("ENQUEUED " + id);
  process.exit(0);
}

main().catch((e) => {
  console.error("ENQUEUE FAILED:", e);
  process.exit(1);
});
