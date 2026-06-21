import {
  AccessToken,
  RoomConfiguration,
  RoomAgentDispatch,
} from "livekit-server-sdk";
import { auth } from "~/server/auth";
import { db } from "~/server/clients/db";
import { env } from "~/env";

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

  const sessionConfig = JSON.stringify({
    userId,
    instanceId: instance.id,
    conversationId: conversation.id,
    personaId: instance.activePersonalityId ?? null,
    // Agent A (voice front) model; null -> the worker uses its house default.
    agentAModel: instance.agentAModel ?? null,
    // Agent B (worker) model — what /api/voice-turn runs for delegated work.
    agentBModel: instance.anthropicModel,
  });

  const roomName = `claw_voice_${userId}`;
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
  // Explicitly dispatch the named worker into this room and hand it the session
  // config (the agent reads ctx.job.metadata).
  at.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({ agentName: "claw-voice", metadata: sessionConfig }),
    ],
  });

  const token = await at.toJwt();
  return Response.json(
    { serverUrl, roomName, token, conversationId: conversation.id },
    { headers: { "Cache-Control": "no-store" } },
  );
}
