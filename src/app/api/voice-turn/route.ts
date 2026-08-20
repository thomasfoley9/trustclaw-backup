import { timingSafeEqual } from "node:crypto";
import { prepareAgentRun } from "~/server/api/routers/trustclaw/agent/setup";
import {
  toPlainRecordSafe,
  toPrismaJson,
} from "~/server/api/routers/trustclaw/agent/context/build-context";
import { stripToolResultEchoes } from "~/server/api/routers/trustclaw/agent/strip-tool-echoes";
import { db } from "~/server/clients/db";
import { env } from "~/env";

// The B-executor for the real-time voice agent. The LiveKit worker's Agent A
// (the voice front) calls this when it decides a turn needs real work: it POSTs
// the user's intent and the session's conversation id, and we run the EXISTING
// Agent B (ToolLoopAgent + Composio, on the user's model) to completion in that
// conversation. We stream B's tool activity (for the cockpit) and return B's
// RAW result text - Agent A adds the persona/voice narration, so we deliberately
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

// Tool inputs can be huge (file contents, scraped pages). Cap what we forward
// over the data channel so a single event can't blow the SSE/data-channel limit.
function clampArgs(input: unknown): Record<string, unknown> {
  try {
    if (JSON.stringify(input).length > 8000) {
      return { _note: "(arguments too large to display)" };
    }
    return (input ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
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
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const conversationId =
    typeof body?.conversationId === "string" ? body.conversationId.trim() : "";
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
    // The persona the SPOKEN agent was dispatched with. It cannot change for
    // the life of the call, so this run replays the same snapshot - without
    // that, switching (or editing) the personality mid-call leaves the old
    // voice speaking the new persona's words.
    select: {
      id: true,
      voicePersonaId: true,
      voicePersonaPrompt: true,
      voicePersonaName: true,
    },
  });
  if (!conv) return new Response("Conversation not found", { status: 404 });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(sse(obj));
        } catch {
          // Stream already closed (client disconnected) - drop the event.
        }
      };
      let closeMcp: () => Promise<void> = () => Promise.resolve();
      // Tools we've told the client are "running". Any id still here when the
      // stream winds down (abort, error, or a stream that ended without its
      // result part) gets a terminal "done" marker - the client's hold-music
      // loop keys off running/done pairs, and an undrained id would keep the
      // arpeggio looping for the rest of the call.
      const runningTools = new Map<string, string>(); // toolCallId -> toolName
      // Barge-in and zero-step errors never reach onFinish, which is what fills
      // the pre-created assistant row - so without these the row stays empty
      // forever, loadContextMessages filters it out, and every LATER turn sees
      // the user's request with no record of the reply or the tools that ran.
      // In a call, where interrupting is normal, that is most of the
      // conversation. Declared out here so the finally can settle the row.
      let partialText = "";
      const partialToolParts: Array<Record<string, unknown>> = [];
      const toolPartByCallId = new Map<string, Record<string, unknown>>();
      // Empty until setup pre-creates the row; a failure before that means
      // there is nothing to settle.
      let assistantMessageId: string | null = null;
      const flushRunningTools = () => {
        for (const [id, name] of runningTools) {
          send({ type: "b_tool", id, name, status: "done" });
        }
        runningTools.clear();
      };
      try {
        // Inside the stream so prep/setup failures (missing key, DB, Composio)
        // surface as a spoken "that didn't work" instead of an unformatted 500.
        const prep = await prepareAgentRun({
          instanceId: instance.id,
          userMessage: intent,
          source: "web",
          conversationId,
          // Null for pre-pin conversations (calls started before this shipped),
          // which simply keeps the old live-switching behavior for them.
          pinnedPersonalityId: conv.voicePersonaId,
          pinnedPersonaPrompt: conv.voicePersonaPrompt,
          pinnedPersonaName: conv.voicePersonaName,
        });
        const { agent, messages } = prep.result;
        assistantMessageId = prep.result.assistantMessageId;
        closeMcp = prep.result.closeMcp;
        // Pass the request signal so a client disconnect (barge-in "cancel")
        // aborts B's tool loop instead of burning tokens to completion.
        const result = await agent.stream({
          prompt: messages,
          abortSignal: request.signal,
        });

        // Stream B's run live: light up each tool the instant it starts
        // ("running") and again when it returns ("done") so the cockpit shows
        // the work as it happens. We ALSO tally B's real tool outcomes here so
        // the result carries a deterministic execution receipt - Agent A anchors
        // its "done / not done" to this, never to B's (or its own) prose, which
        // is what stops A fabricating a completed action.
        let toolsSucceeded = 0;
        let toolsErrored = 0;
        const toolNames = new Set<string>();
        for await (const part of result.fullStream) {
          // Barge-in / disconnect: stop forwarding immediately rather than
          // waiting for the abort to propagate through the SDK.
          if (request.signal.aborted) break;
          switch (part.type) {
            case "text-delta":
              partialText += part.text;
              break;
            case "tool-input-start":
              runningTools.set(part.id, part.toolName);
              send({
                type: "b_tool",
                id: part.id,
                name: part.toolName,
                status: "running",
              });
              break;
            case "tool-call": {
              toolNames.add(part.toolName);
              runningTools.set(part.toolCallId, part.toolName);
              // Keep the tool CALL (with its input) for the settle: for a
              // drafting turn the draft body lives in this input, so losing it
              // is exactly how "make that shorter" stops working.
              const toolPart: Record<string, unknown> = {
                type: "dynamic-tool",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                state: "input-available",
                input: toPlainRecordSafe(part.input),
                output: {},
              };
              partialToolParts.push(toolPart);
              toolPartByCallId.set(part.toolCallId, toolPart);
              send({
                type: "b_tool",
                id: part.toolCallId,
                name: part.toolName,
                status: "running",
                args: clampArgs(part.input),
              });
              break;
            }
            case "tool-result": {
              toolsSucceeded += 1;
              runningTools.delete(part.toolCallId);
              const done = toolPartByCallId.get(part.toolCallId);
              if (done) {
                done.state = "output-available";
                done.output = toPlainRecordSafe(part.output);
              }
              send({
                type: "b_tool",
                id: part.toolCallId,
                name: part.toolName,
                status: "done",
              });
              break;
            }
            case "tool-error":
              toolsErrored += 1;
              runningTools.delete(part.toolCallId);
              send({
                type: "b_tool",
                id: part.toolCallId,
                name: part.toolName,
                status: "done",
              });
              break;
          }
        }
        // However the loop exited, close out any tools still marked running.
        flushRunningTools();
        // Caller bailed - don't wait on result.text or emit into a dead stream
        // (the finally still closes the controller).
        if (request.signal.aborted) return;
        // result.text is B's final answer (resolves after the stream drains) -
        // correct across multi-tool runs, unlike hand-accumulating deltas.
        const text = (await result.text).trim();
        // Deterministic receipt of what B ACTUALLY did this turn:
        //   executed  - at least one tool returned successfully (real work happened)
        //   failed    - tools were attempted but only errored
        //   no_action - B ran no tools at all (it only talked / drafted / needs input)
        const status =
          toolsErrored > 0 && toolsSucceeded === 0
            ? "failed"
            : toolsSucceeded > 0
              ? "executed"
              : "no_action";
        send({
          type: "result",
          text,
          status,
          toolsSucceeded,
          toolsErrored,
          tools: [...toolNames],
        });
        send({ type: "done" });
      } catch (err) {
        flushRunningTools();
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Agent error",
        });
      } finally {
        // Settle the assistant row if onFinish never ran (barge-in, error).
        // Filtered on an EMPTY row so a completed turn is untouched, and
        // onFinish updates by id, so if it lands later it simply wins with the
        // fuller version. Without this the turn is invisible to every later
        // turn's context even though the user heard it happen.
        // Strip echoed tool output the same way the happy path and the web
        // abort path do, so a barged turn doesn't bake raw tool dumps into
        // permanent context.
        const settledText = stripToolResultEchoes(partialText).trim();
        const settleParts: Array<Record<string, unknown>> = [
          ...partialToolParts,
          ...(settledText ? [{ type: "text", text: settledText }] : []),
        ];
        // Target THIS turn's row by id. The voice thread is reused across
        // calls, so matching on "any empty assistant row in the conversation"
        // would also hit orphans from earlier turns and rewrite their content.
        // Still filtered on empty so a completed turn is never clobbered.
        const emptyAssistantRow = {
          id: assistantMessageId ?? "",
          content: { equals: [] },
        };
        if (assistantMessageId && settleParts.length > 0) {
          await db.message
            .updateMany({
              where: emptyAssistantRow,
              data: { content: toPrismaJson(settleParts) },
            })
            .catch(() => undefined);
        } else if (assistantMessageId && request.signal.aborted) {
          // Nothing streamed before the barge - drop the orphan row rather than
          // leaving an empty turn in the thread.
          await db.message
            .deleteMany({ where: emptyAssistantRow })
            .catch(() => undefined);
        }
        // Barge-in aborts and zero-step errors never reach onFinish's
        // mcp.close - idempotent, so double-close is fine.
        await closeMcp().catch(() => undefined);
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
