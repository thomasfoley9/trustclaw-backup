import { smoothStream, UI_MESSAGE_STREAM_HEADERS } from "ai";
import { z } from "zod";
import { auth } from "~/server/auth";
import { db } from "~/server/clients/db";
import { prepareAgentRun } from "~/server/api/routers/trustclaw/agent/setup";
import {
  setStreamingMessage,
  getStreamingMessage,
  clearStreamingMessage,
} from "~/server/clients/redis";
import { getStreamContext } from "./stream-store";

const MAX_MESSAGE_CHARS = 32_000;

// Per-instance request rate limit (sliding window) + single-stream guard.
// In-memory: correct for a single-node deployment; swap to Redis when
// horizontally scaled.
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX_REQUESTS = 30;
const STREAM_GUARD_STALE_MS = 90_000;
const requestTimestamps = new Map<string, number[]>();
const activeStreams = new Map<string, number>();

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
  conversationId: z.string().optional(),
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

export const maxDuration = 60;

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

  const activeSince = activeStreams.get(instanceId);
  if (activeSince && Date.now() - activeSince < STREAM_GUARD_STALE_MS) {
    return new Response(
      "A response is already streaming for this account - wait for it to finish",
      { status: 409 },
    );
  }

  const body = chatRequestBody.safeParse(await request.json());
  if (!body.success) {
    return new Response("Invalid request body", { status: 400 });
  }

  // Validate the pinned conversation belongs to this instance.
  let conversationId: string | undefined;
  if (body.data.conversationId) {
    const owned = await db.conversation.findFirst({
      where: { id: body.data.conversationId, instanceId },
      select: { id: true },
    });
    if (!owned) {
      return new Response("Conversation not found", { status: 404 });
    }
    conversationId = owned.id;
  }

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
  if (!userText.trim()) {
    return new Response("Empty message", { status: 400 });
  }
  if (userText.length > MAX_MESSAGE_CHARS) {
    return new Response("Message too long", { status: 413 });
  }

  activeStreams.set(instanceId, Date.now());

  const streamId = crypto.randomUUID();
  let result;
  try {
    const prepareResult = await prepareAgentRun({
      instanceId,
      userMessage: userText,
      source: "web",
      conversationId,
    });

    const { agent, messages } = prepareResult.result;

    await setStreamingMessage(instanceId, streamId);

    // agent.stream() returns streamText() result - supports toUIMessageStreamResponse
    // Pass request.signal so the agent stops when the client disconnects (stop button)
    result = await agent.stream({
      prompt: messages,
      experimental_transform: smoothStream(),
      abortSignal: request.signal,
    });
  } catch (error) {
    activeStreams.delete(instanceId);
    throw error;
  }

  // Release the single-stream guard when the run settles (finish, error, or
  // abort all settle the text promise); the 90s stale window is the backstop.
  void Promise.resolve(result.text)
    .catch(() => undefined)
    .finally(() => {
      activeStreams.delete(instanceId);
    });

  // If the client aborted, onFinish may never run: the pre-created assistant
  // row stays empty and the stream marker stays set. Clean both up so they
  // never pollute history/context.
  request.signal.addEventListener("abort", () => {
    activeStreams.delete(instanceId);
    void db.message
      .deleteMany({
        where: {
          instanceId,
          role: "assistant",
          source: "web",
          content: { equals: [] },
        },
      })
      .catch(() => undefined);
    void clearStreamingMessage(instanceId).catch(() => undefined);
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
