import { z } from "zod";
import { auth } from "~/server/auth";
import { db } from "~/server/clients/db";
import {
  abortRun,
  markRunEnded,
} from "~/server/api/routers/trustclaw/agent/run-registry";
import { clearStreamingMessage } from "~/server/clients/redis";

const stopBody = z.object({ conversationId: z.string() });

// Explicitly stop a background run. Abort is best-effort (reaches runs in
// this process); the DB run flag is always cleared so the UI unblocks.
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
  await markRunEnded(owned.id);
  await clearStreamingMessage(instance.id).catch(() => undefined);
  // Remove the empty assistant row the aborted run leaves behind.
  await db.message
    .deleteMany({
      where: {
        conversationId: owned.id,
        role: "assistant",
        source: "web",
        content: { equals: [] },
      },
    })
    .catch(() => undefined);

  return Response.json({ stopped: true, aborted });
}
