import { timingSafeEqual } from "node:crypto";
import { prepareAgentRun } from "~/server/api/routers/trustclaw/agent/setup";
import { db } from "~/server/clients/db";
import { env } from "~/env";

// The B-executor for the real-time voice agent. The LiveKit worker's Agent A
// (the voice front) calls this when it decides a turn needs real work: it POSTs
// the user's intent and the session's conversation id, and we run the EXISTING
// Agent B (ToolLoopAgent + Composio, on the user's model) to completion in that
// conversation. We stream B's tool activity (for the cockpit) and return B's
// RAW result text — Agent A adds the persona/voice narration, so we deliberately
// don't narrate here (no double-narration).
//
// Auth: a shared secret that only the LiveKit worker holds (constant-time
// compared). The user binding (userId + conversationId) comes from the LiveKit
// token metadata the worker forwards; we additionally verify the conversation
// belongs to that user's instance. Sensitive keys/DB never leave Vercel.
export const maxDuration = 300; // long multi-tool jobs

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function sse(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

export async function POST(request: Request) {
  const secret = env.VOICE_WORKER_SHARED_SECRET;
  const authz = request.headers.get("authorization") ?? "";
  const provided = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!secret || !provided || !safeEqual(provided, secret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    intent?: unknown;
    userId?: unknown;
    conversationId?: unknown;
  } | null;
  const intent = typeof body?.intent === "string" ? body.intent.trim() : "";
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const conversationId =
    typeof body?.conversationId === "string" ? body.conversationId : "";
  if (!intent || !userId || !conversationId) {
    return new Response("Missing intent/userId/conversationId", { status: 400 });
  }

  // Defense in depth: the conversation must belong to this user's instance.
  const instance = await db.composioClawInstance.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!instance) return new Response("No instance", { status: 404 });
  const conv = await db.conversation.findFirst({
    where: { id: conversationId, instanceId: instance.id },
    select: { id: true },
  });
  if (!conv) return new Response("Conversation not found", { status: 404 });

  const prep = await prepareAgentRun({
    instanceId: instance.id,
    userMessage: intent,
    source: "web",
    conversationId,
  });
  const { agent, messages } = prep.result;

  // Pass the request signal so a client disconnect (barge-in "cancel") aborts
  // B's tool loop instead of letting it burn tokens to completion.
  const result = await agent.stream({
    prompt: messages,
    abortSignal: request.signal,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(sse(obj));
      try {
        const steps = await result.steps;
        for (const step of steps) {
          for (let i = 0; i < step.toolCalls.length; i++) {
            const tc = step.toolCalls[i];
            if (!tc) continue;
            send({
              type: "b_tool",
              name: tc.toolName,
              status: step.toolResults[i] != null ? "done" : "running",
            });
          }
        }
        const text = (await result.text).trim();
        send({ type: "result", text });
        send({ type: "done" });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Agent error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
