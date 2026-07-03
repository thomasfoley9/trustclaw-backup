import { AccessToken, AgentDispatchClient } from "livekit-server-sdk";
import { auth } from "~/server/auth";
import { db } from "~/server/clients/db";
import { env } from "~/env";
import { DEFAULT_VOICE_ID } from "~/server/clients/smallest";

// Mints a short-lived LiveKit room-join JWT for the signed-in user. The room is
// derived SERVER-SIDE from the user id, so a caller can only ever join their own
// room — never another user's voice session. Per-session config (which models,
// persona, and the fresh voice conversation id) rides in the token + agent
// dispatch metadata so the LiveKit worker knows who it's acting for.
export const runtime = "nodejs"; // livekit-server-sdk needs Node, not edge

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const apiKey = env.LIVEKIT_API_KEY;
  const apiSecret = env.LIVEKIT_API_SECRET;
  const serverUrl = env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!apiKey || !apiSecret || !serverUrl) {
    return new Response("Voice isn't configured", { status: 412 });
  }

  const userId = session.user.id;
  const instance = await db.composioClawInstance.findUnique({
    where: { userId },
    select: {
      id: true,
      agentAModel: true,
      anthropicModel: true,
      activePersonalityId: true,
      voiceId: true,
    },
  });
  if (!instance) {
    return new Response("No instance", { status: 404 });
  }

  // Separate voice thread: a brand-new conversation per call. Intentionally does
  // NOT become the active (text) conversation — voice gets its own clean thread
  // but still inherits the shared, instance-level memory at run time.
  const conversation = await db.conversation.create({
    data: { instanceId: instance.id, title: "Voice call" },
    select: { id: true },
  });

  // The active personality's prompt drives Agent A's SPOKEN voice — without it,
  // the voice front falls back to the default Claw character while the text
  // agent uses the personality. Forward it in the dispatch metadata so voice
  // matches text.
  const activePersonality = instance.activePersonalityId
    ? await db.personality.findFirst({
        where: { id: instance.activePersonalityId, instanceId: instance.id },
        select: { name: true, prompt: true },
      })
    : null;

  const sessionConfig = JSON.stringify({
    userId,
    instanceId: instance.id,
    conversationId: conversation.id,
    personaId: instance.activePersonalityId ?? null,
    personaName: activePersonality?.name ?? null,
    // Full personality prompt — Agent A adopts this as its spoken character so
    // the voice matches the personality the user picked (same as text chat).
    personaPrompt: activePersonality?.prompt ?? null,
    // Agent A (voice front) model; null -> the worker uses its house default.
    agentAModel: instance.agentAModel ?? null,
    // Agent B (worker) model — what /api/voice-turn runs for delegated work.
    agentBModel: instance.anthropicModel,
    // The user's chosen OpenAI Realtime voice; the worker maps unknown ids
    // (e.g. legacy Smallest ids) to its default.
    voiceId: instance.voiceId ?? DEFAULT_VOICE_ID,
  });

  // Unique room per call (keyed by the fresh conversation) → a clean room with
  // exactly one agent dispatch, no leftover dispatches from prior calls.
  const roomName = `claw_voice_${conversation.id}`;
  const at = new AccessToken(apiKey, apiSecret, {
    identity: `user_${userId}`,
    name: session.user.name ?? "user",
    ttl: "20m",
    // Also on the participant, as a fallback the agent can read.
    metadata: sessionConfig,
  });
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  });
  const token = await at.toJwt();

  // Dispatch the worker EXPLICITLY via the dispatch API — the same reliable path
  // LiveKit's own console uses. Embedding the dispatch in the join token
  // (RoomConfiguration) proved flaky for Cloud agents. The agent reads
  // ctx.job.metadata for the session config.
  const httpUrl = serverUrl.replace(/^ws/, "http"); // wss:// -> https://
  const dispatcher = new AgentDispatchClient(httpUrl, apiKey, apiSecret);
  try {
    // Bounded: if the dispatch service is slow/unreachable, fail fast with a
    // clear error instead of hanging the call (or 500ing) and leaving the user
    // in an agent-less room.
    await Promise.race([
      dispatcher.createDispatch(roomName, "claw-voice", {
        metadata: sessionConfig,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("dispatch timeout")), 8000),
      ),
    ]);
  } catch {
    // Don't leave an orphaned "Voice call" conversation behind if the agent
    // never got dispatched.
    await db.conversation
      .delete({ where: { id: conversation.id } })
      .catch(() => undefined);
    return new Response("Couldn't start the voice agent — try again.", {
      status: 503,
    });
  }

  return Response.json(
    { serverUrl, roomName, token, conversationId: conversation.id },
    { headers: { "Cache-Control": "no-store" } },
  );
}
