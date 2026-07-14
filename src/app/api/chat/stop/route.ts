import { z } from "zod";
import { auth } from "~/server/auth";
import { db } from "~/server/clients/db";
import {
  abortRun,
  markRunEnded,
} from "~/server/api/routers/trustclaw/agent/run-registry";
import {
  clearStreamingMessage,
  requestRunAbort,
} from "~/server/clients/redis";

const stopBody = z.object({ conversationId: z.string() });

// Explicitly stop a background run. A run in this process is aborted directly;
// a run on another serverless instance is reached via a Redis abort flag that
// the run's driver polls. Only a run we actually aborted here gets its state
// scrubbed - a remote run cleans up after itself when it sees the flag.
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const instance = await db.composioClawInstance.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!instance) {
    return new Response("Not found", { status: 404 });
  }

  const body = stopBody.safeParse(await request.json());
  if (!body.success) {
    return new Response("Invalid request body", { status: 400 });
  }

  const owned = await db.conversation.findFirst({
    where: { id: body.data.conversationId, instanceId: instance.id },
    select: { id: true },
  });
  if (!owned) {
    return new Response("Conversation not found", { status: 404 });
  }

  const aborted = abortRun(owned.id);
  if (aborted) {
    // The abort reached the run in this process: its stream is dead, so
    // release the claim and drop the resume pointer. The partial reply is
    // persisted by the run's own abort handling - never delete the row here.
    await markRunEnded(owned.id);
    await clearStreamingMessage(instance.id, owned.id).catch(() => undefined);
  } else {
    // The run lives on another instance. Signal it via Redis and let it clear
    // its own claim when it aborts - clearing the flag here would let a new
    // send race the still-live orphan into the same conversation.
    await requestRunAbort(owned.id).catch(() => undefined);
  }

  return Response.json({ stopped: true, aborted });
}
