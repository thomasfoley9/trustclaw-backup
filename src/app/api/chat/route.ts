import { after } from "next/server";
import { smoothStream, UI_MESSAGE_STREAM_HEADERS } from "ai";
import { z } from "zod";
import { auth } from "~/server/auth";
import { db } from "~/server/clients/db";
import { prepareAgentRun } from "~/server/api/routers/trustclaw/agent/setup";
import {
  markRunStarted,
  markRunEnded,
  runIsFresh,
  RUN_STALE_MS,
} from "~/server/api/routers/trustclaw/agent/run-registry";
import {
  setStreamingMessage,
  getStreamingMessage,
  clearStreamingMessage,
} from "~/server/clients/redis";
import { getStreamContext } from "./stream-store";

const MAX_MESSAGE_CHARS = 32_000;
const MAX_ATTACHMENTS = 8;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
// Max simultaneous background runs per account.
const MAX_CONCURRENT_RUNS = 3;

// Per-instance request rate limit (sliding window). In-memory: correct for a
// single-node deployment; swap to Redis when horizontally scaled.
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX_REQUESTS = 30;
const requestTimestamps = new Map<string, number[]>();

function checkRateLimit(instanceId: string): boolean {
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

// Long enough for tool-heavy agent runs to finish in the background after the
// viewer navigates away (Vercel fluid compute honors this via after()).
export const maxDuration = 300;

export async function POST(request: Request) {
  const authResult = await getAuthenticatedInstance(request);
  if (!authResult) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { instanceId } = authResult;

  if (!checkRateLimit(instanceId)) {
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
    select: { id: true, activeRunStartedAt: true },
  });
  if (!owned) {
    return new Response("Conversation not found", { status: 404 });
  }
  if (runIsFresh(owned.activeRunStartedAt)) {
    return new Response(
      "This chat is still answering - wait for it to finish",
      { status: 409 },
    );
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
  let result;
  // The run is driven by a server-side controller, NOT request.signal: closing
  // the tab or switching sessions detaches the viewer but the run continues in
  // the background and persists its result via onFinish. Explicit stop comes
  // through /api/chat/stop, which aborts this controller.
  const runController = await markRunStarted(conversationId);
  try {
    const prepareResult = await prepareAgentRun({
      instanceId,
      userMessage: userText,
      source: "web",
      conversationId,
      attachments,
    });

    const { agent, messages } = prepareResult.result;

    await setStreamingMessage(instanceId, streamId);

    // agent.stream() returns streamText() result - supports toUIMessageStreamResponse
    result = await agent.stream({
      prompt: messages,
      experimental_transform: smoothStream(),
      abortSignal: runController.signal,
    });
  } catch (error) {
    // Run died before streaming started (e.g. provider rejected the call):
    // clean the pre-created empty assistant row so it can't pollute history.
    await db.message
      .deleteMany({
        where: {
          conversationId,
          role: "assistant",
          source: "web",
          content: { equals: [] },
        },
      })
      .catch(() => undefined);
    await clearStreamingMessage(instanceId).catch(() => undefined);
    await markRunEnded(conversationId);
    throw error;
  }

  // Drive the run to completion independently of the client connection, then
  // clean up: if the run errored/was stopped before onFinish filled the
  // pre-created assistant row, remove the empty row + stream marker so they
  // never pollute history/context.
  after(async () => {
    try {
      await result.consumeStream({ onError: () => undefined });
    } catch {
      // consumeStream shouldn't throw with onError set; belt and suspenders.
    } finally {
      await db.message
        .deleteMany({
          where: {
            conversationId,
            role: "assistant",
            source: "web",
            content: { equals: [] },
          },
        })
        .catch(() => undefined);
      await clearStreamingMessage(instanceId).catch(() => undefined);
      await markRunEnded(conversationId);
    }
  });

  const streamContext = getStreamContext();
  return result.toUIMessageStreamResponse({
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

  if (!streamId) {
    return new Response("Missing streamId", { status: 400 });
  }

  const activeStreamId = await getStreamingMessage(instanceId);
  if (activeStreamId !== streamId) {
    return new Response("Stream not found or not yours", { status: 404 });
  }

  const streamContext = getStreamContext();
  if (!streamContext) {
    return new Response("Stream resumption not available", { status: 204 });
  }
  const stream = await streamContext.resumeExistingStream(streamId);
  if (!stream) {
    return new Response("Stream already completed", { status: 204 });
  }

  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: UI_MESSAGE_STREAM_HEADERS,
  });
}
