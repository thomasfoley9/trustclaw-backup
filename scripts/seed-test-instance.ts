/* eslint-disable no-console -- local end-to-end test helper (not shipped) */
//
// Seeds a keyless, incognito instance into the LOCAL throwaway DB so the worker
// pipeline can be exercised without API keys or credits: incognito skips the
// memory/embedding path, so the run reaches - and fails closed at - the
// Composio key check, after proving instance-load + message-row creation.
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
  console.log("INSTANCE_ID=" + instance.id);
  process.exit(0);
}

main().catch((e) => {
  console.error("SEED FAILED:", e);
  process.exit(1);
});
