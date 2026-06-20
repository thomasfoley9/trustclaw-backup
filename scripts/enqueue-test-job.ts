/* eslint-disable no-console -- local end-to-end test helper (not shipped) */
//
// Enqueues one agent job onto the BullMQ queue, for driving the worker
// end-to-end locally. Reads TEST_INSTANCE_ID from the environment.
//
import { enqueueAgentJob } from "~/server/clients/job-queue";

async function main() {
  const instanceId = process.env.TEST_INSTANCE_ID;
  if (!instanceId) throw new Error("set TEST_INSTANCE_ID");
  const id = await enqueueAgentJob(`local-test:${Date.now()}`, {
    instanceId,
    userId: "test-user-local",
    userMessage: "Say the single word PONG.",
    source: "web",
  });
  console.log("ENQUEUED " + id);
  process.exit(0);
}

main().catch((e) => {
  console.error("ENQUEUE FAILED:", e);
  process.exit(1);
});
