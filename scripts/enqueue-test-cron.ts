/* eslint-disable no-console -- local end-to-end test helper (not shipped) */
//
// Enqueues a cron job batch onto the queue, exactly as the cron /execute route
// does when WORKER_QUEUE_ENABLED=true. Reads the seeded job from the env.
//
import { enqueueCronJob } from "~/server/clients/job-queue";

async function main() {
  const cronJobId = process.env.TEST_CRON_JOB_ID;
  const instanceId = process.env.TEST_INSTANCE_ID;
  if (!cronJobId || !instanceId) {
    throw new Error("set TEST_CRON_JOB_ID and TEST_INSTANCE_ID");
  }
  const id = await enqueueCronJob("inv-test", {
    jobs: [
      {
        id: cronJobId,
        instanceId,
        expression: "*/5 * * * *",
        prompt: "ping",
        timezone: "UTC",
        lockedBy: "inv-test",
        telegramChatId: null,
      },
    ],
    invocationId: "inv-test",
  });
  console.log("ENQUEUED " + id);
  process.exit(0);
}

main().catch((e) => {
  console.error("ENQUEUE FAILED:", e);
  process.exit(1);
});
