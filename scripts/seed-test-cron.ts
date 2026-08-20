/* eslint-disable no-console -- local end-to-end test helper (not shipped) */
//
// Seeds a keyless incognito instance + a LOCKED, due cron job into the local
// throwaway DB, so the cron worker path can be exercised: the worker should run
// the (key-less, fail-closed) job and still release the lock + recompute
// nextRunAt, proving the lock lifecycle survives a failed run.
//
import { db } from "~/server/clients/db";

async function main() {
  await db.user.upsert({
    where: { id: "test-user-local" },
    update: {},
    create: {
      id: "test-user-local",
      name: "Local Test",
      email: "local-test@example.com",
    },
  });
  const instance = await db.composioClawInstance.upsert({
    where: { userId: "test-user-local" },
    update: { incognitoMode: true },
    create: { userId: "test-user-local", incognitoMode: true },
  });
  const job = await db.cronJob.create({
    data: {
      instanceId: instance.id,
      expression: "*/5 * * * *",
      prompt: "ping",
      timezone: "UTC",
      lockedBy: "inv-test",
      lockedAt: new Date(),
      nextRunAt: null,
    },
  });
  console.log("CRON_JOB_ID=" + job.id);
  console.log("INSTANCE_ID=" + instance.id);
  process.exit(0);
}

main().catch((e) => {
  console.error("SEED FAILED:", e);
  process.exit(1);
});
