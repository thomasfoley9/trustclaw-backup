import { after } from "next/server";
import {
  smoothStream,
  UI_MESSAGE_STREAM_HEADERS,
  createUIMessageStreamResponse,
} from "ai";
import { z } from "zod";
import { auth } from "~/server/auth";
import { db } from "~/server/clients/db";
import { prepareAgentRun } from "~/server/api/routers/trustclaw/agent/setup";
import { parseAgentError } from "~/server/api/routers/trustclaw/agent/error-parser";
import {
  tryClaimRun,
  markRunEnded,
  RUN_STALE_MS,
} from "~/server/api/routers/trustclaw/agent/run-registry";
import {
  setStreamingMessage,
  getStreamingMessage,
  clearStreamingMessage,
  isRedisConfigured,
  slidingWindowAllow,
} from "~/server/clients/redis";
import { getStreamContext } from "./stream-store";

const MAX_MESSAGE_CHARS = 32_000;
const MAX_ATTACHMENTS = 8;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
// Max simultaneous background runs per account.
const MAX_CONCURRENT_RUNS = 3;

// Per-instance request rate limit (sliding window). Redis-backed so the limit
// is shared across all serverless instances; the in-process map is only the
// fallback when Redis isn't configured (local dev). Fail-open on Redis errors,
// so an infra hiccup degrades to "no limit" rather than blocking chat.
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX_REQUESTS = 30;
const requestTimestamps = new Map<string, number[]>();

function checkRateLimitInMemory(instanceId: string): boolean {
  const now = Date.now();
  const stamps = (requestTimestamps.get(instanceId) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS,
  );
  if (stamps.length >= RATE_MAX_REQUESTS) {
    requestTimestamps.set(instanceId, stamps);
    return false;
  }
  stamps.push(now);
  requestTimestamps.set(instanceId, stamps);
  return true;
}

async function checkRateLimit(instanceId: string): Promise<boolean> {
  if (isRedisConfigured()) {
    return slidingWindowAllow(
      `chat:${instanceId}`,
      RATE_WINDOW_MS,
      RATE_MAX_REQUESTS,
    );
  }
  return checkRateLimitInMemory(instanceId);
}

const chatRequestBody = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string().optional(),
      parts: z.array(z.record(z.unknown())).optional(),
    }),
  ),
  conversationId: z.string(),
});

async function getAuthenticatedInstance(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return null;
  }

  const userId = session.user.id;
  const instance = await db.composioClawInstance.findUnique({
    where: { userId },
    select: { id: true, userId: true },
  });

  if (!instance) {
    return null;
  }

  return { userId, instanceId: instance.id };
}

// TEXT CHAT IS SINGLE-AGENT: the agent's full text streams straight through to
// the client, live. No Agent A narration/condensing here — the two-agent split
// exists only on the voice plane (/api/voice-turn + the realtime worker), where
// replies must be short enough to speak.

// Long enough for tool-heavy agent runs to finish in the background after the
// viewer navigates away (Vercel fluid compute honors this via after()).
export const maxDuration = 300;

export async function POST(request: Request) {
  const authResult = await getAuthenticatedInstance(request);
  if (!authResult) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { instanceId } = authResult;

  if (!(await checkRateLimit(instanceId))) {
    return new Response("Too many requests - slow down a little", {
      status: 429,
    });
  }

  const body = chatRequestBody.safeParse(await request.json());
  if (!body.success) {
    return new Response("Invalid request body", { status: 400 });
  }

  // Validate the pinned conversation belongs to this instance, and that it
  // doesn't already have a run in flight (runs are per-session; one at a time
  // per session, up to MAX_CONCURRENT_RUNS per account).
  const owned = await db.conversation.findFirst({
    where: { id: body.data.conversationId, instanceId },
    select: { id: true },
  });
  if (!owned) {
    return new Response("Conversation not found", { status: 404 });
  }
  const runningCount = await db.conversation.count({
    where: {
      instanceId,
      activeRunStartedAt: { gt: new Date(Date.now() - RUN_STALE_MS) },
    },
  });
  if (runningCount >= MAX_CONCURRENT_RUNS) {
    return new Response(
      `Too many chats running at once (max ${MAX_CONCURRENT_RUNS}) - wait for one to finish`,
      { status: 429 },
    );
  }
  const conversationId = owned.id;

  const lastUserMessage = [...body.data.messages]
    .reverse()
    .find((m) => m.role === "user");
  const userText =
    lastUserMessage?.parts
      ?.filter(
        (p): p is { type: string; text: string } =>
          typeof p === "object" &&
          p !== null &&
          "type" in p &&
          p.type === "text" &&
          "text" in p &&
          typeof p.text === "string",
      )
      .map((p) => p.text)
      .join("\n") ?? "";

  // Extract attached files (AI SDK sends them as file parts with data URLs).
  const attachments: Array<{ name: string; mediaType: string; data: string }> =
    [];
  let attachmentBytes = 0;
  for (const p of lastUserMessage?.parts ?? []) {
    if (
      typeof p !== "object" ||
      p === null ||
      (p as { type?: unknown }).type !== "file"
    ) {
      continue;
    }
    const fp = p as { mediaType?: unknown; url?: unknown; filename?: unknown };
    if (typeof fp.url !== "string") continue;
    const match = /^data:([^;,]+)(?:;base64)?,(.*)$/s.exec(fp.url);
    if (!match) continue;
    const base64 = match[2]!;
    attachmentBytes += Math.floor(base64.length * 0.75);
    attachments.push({
      name: typeof fp.filename === "string" ? fp.filename : "file",
      mediaType:
        typeof fp.mediaType === "string"
          ? fp.mediaType
          : (match[1] ?? "application/octet-stream"),
      data: base64,
    });
  }
  if (attachments.length > MAX_ATTACHMENTS) {
    return new Response(`Too many files (max ${MAX_ATTACHMENTS})`, {
      status: 400,
    });
  }
  if (attachmentBytes > MAX_ATTACHMENT_BYTES) {
    return new Response("Attachments too large (max 25MB total)", {
      status: 413,
    });
  }

  if (!userText.trim() && attachments.length === 0) {
    return new Response("Empty message", { status: 400 });
  }
  if (userText.length > MAX_MESSAGE_CHARS) {
    return new Response("Message too long", { status: 413 });
  }

  const streamId = crypto.randomUUID();
  // Set by the response transform's onError; read by the background settle.
  let capturedError: unknown = null;
  let result;
  // The run is driven by a server-side controller, NOT request.signal: closing
  // the tab or switching sessions detaches the viewer but the run continues in
  // the background and persists its result via onFinish. Explicit stop comes
  // through /api/chat/stop, which aborts this controller. The claim is atomic:
  // concurrent sends to the same session can't start two runs.
  const claim = await tryClaimRun(conversationId);
  if (!claim) {
    return new Response(
      "This chat is still answering - wait for it to finish",
      { status: 409 },
    );
  }
  const { controller: runController, claimedAt } = claim;
  let closeMcp: () => Promise<void> = () => Promise.resolve();
  try {
    const prepareResult = await prepareAgentRun({
      instanceId,
      userMessage: userText,
      source: "web",
      conversationId,
      attachments,
    });

    const { agent, messages } = prepareResult.result;
    closeMcp = prepareResult.result.closeMcp;

    await setStreamingMessage(instanceId, conversationId, streamId);

    // agent.stream() returns streamText() result - supports toUIMessageStreamResponse
    result = await agent.stream({
      prompt: messages,
      experimental_transform: smoothStream(),
      abortSignal: runController.signal,
    });
  } catch (error) {
    // Run died before streaming started (e.g. provider rejected the call):
    // turn the pre-created assistant row into a visible error bubble so the
    // failure is never silent.
    await db.message
      .updateMany({
        where: {
          conversationId,
          role: "assistant",
          source: "web",
          content: { equals: [] },
        },
        data: {
          content: [
            { type: "text", text: `⚠️ ${parseAgentError(error)}` },
          ],
        },
      })
      .catch(() => undefined);
    // Setup failures after the MCP clients opened (e.g. the provider rejected
    // the call) never reach onFinish — close them here or they leak.
    await closeMcp().catch(() => undefined);
    await clearStreamingMessage(instanceId, conversationId, streamId).catch(
      () => undefined,
    );
    // Guard the unclaim: a throw here would mask the real error above, and a
    // silent failure would strand the run flag (blocking the chat until the
    // 5-min stale timeout). Worst case is bounded, but log it.
    await markRunEnded(conversationId, claimedAt).catch((err) =>
      console.error("[chat] markRunEnded after setup failure failed:", err),
    );
    throw error;
  }

  // Drive the run to completion independently of the client connection, then
  // settle the pre-created assistant row: onFinish fills it on success; on
  // failure it becomes a visible error bubble (silent no-reply failures are
  // worse than ugly ones); on user-initiated stop it's removed.
  after(async () => {
    let runError: unknown = null;
    try {
      // Drive the run to completion ourselves and read provider errors
      // directly off the source stream (they arrive as 'error' PARTS, which
      // consumeStream's onError does not surface).
      for await (const part of result.fullStream) {
        if (
          typeof part === "object" &&
          part !== null &&
          (part as { type?: unknown }).type === "error"
        ) {
          runError = (part as { error?: unknown }).error ?? part;
        }
      }
    } catch (error) {
      runError = error;
    } finally {
      runError = runError ?? capturedError;
      const emptyRowFilter = {
        conversationId,
        role: "assistant" as const,
        source: "web" as const,
        content: { equals: [] },
      };
      // Branch on ROW STATE, not error plumbing: onFinish fills the row on
      // success, so a still-empty row means the run produced nothing. Unless
      // the user stopped it, turn it into a visible error bubble - silent
      // no-reply failures are worse than ugly ones.
      if (runController.signal.aborted) {
        await db.message
          .deleteMany({ where: emptyRowFilter })
          .catch(() => undefined);
      } else {
        const text = runError
          ? parseAgentError(runError)
          : "The model didn't return a response. Please try again.";
        await db.message
          .updateMany({
            where: emptyRowFilter,
            data: { content: [{ type: "text", text: `⚠️ ${text}` }] },
          })
          .catch(() => undefined);
      }
      // Abort and zero-step failures never reach onFinish's mcp.close —
      // idempotent, so double-close on the happy path is fine.
      await closeMcp().catch(() => undefined);
      await clearStreamingMessage(instanceId, conversationId, streamId).catch(
        () => undefined,
      );
      await markRunEnded(conversationId, claimedAt);
    }
  });

  const streamContext = getStreamContext();
  // The agent's UI stream, text and tools alike, with the error parser
  // attached (live viewers get the friendly error text, and the capture feeds
  // the persisted error bubble).
  const uiStream = result.toUIMessageStream({
    onError: (error) => {
      capturedError = error;
      return `⚠️ ${parseAgentError(error)}`;
    },
  });
  return createUIMessageStreamResponse({
    stream: uiStream,
    headers: {
      "X-Stream-Id": streamId,
    },
    ...(streamContext
      ? {
          consumeSseStream: ({ stream }) => {
            void streamContext.createNewResumableStream(
              streamId,
              () => stream,
            );
          },
        }
      : {}),
  });
}

export async function GET(request: Request) {
  const authResult = await getAuthenticatedInstance(request);
  if (!authResult) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { instanceId } = authResult;
  const url = new URL(request.url);
  const streamId = url.searchParams.get("streamId");
  const conversationId = url.searchParams.get("conversationId");

  if (!streamId || !conversationId) {
    return new Response("Missing streamId/conversationId", { status: 400 });
  }

  const activeStreamId = await getStreamingMessage(instanceId, conversationId);
  if (activeStreamId !== streamId) {
    // A stale/finished pointer is "nothing to resume", not an error — a 404
    // here made the SDK's reconnect throw a spurious toast on idle chats.
    return new Response(null, { status: 204 });
  }

  const streamContext = getStreamContext();
  // 204 is a null-body status — passing a body string makes the Response
  // constructor itself throw (500) instead of returning "nothing to resume".
  if (!streamContext) {
    return new Response(null, { status: 204 });
  }
  const stream = await streamContext.resumeExistingStream(streamId);
  if (!stream) {
    return new Response(null, { status: 204 });
  }

  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: UI_MESSAGE_STREAM_HEADERS,
  });
}
