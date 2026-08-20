import { randomUUID } from "node:crypto";
import { AccessToken, AgentDispatchClient } from "livekit-server-sdk";
import { auth } from "~/server/auth";
import { db } from "~/server/clients/db";
import { env } from "~/env";
import { DEFAULT_VOICE_ID } from "~/server/clients/smallest";

// Mints a short-lived LiveKit room-join JWT for the signed-in user. The room is
// derived SERVER-SIDE from the user id, so a caller can only ever join their own
// room - never another user's voice session. Per-session config (which models,
// persona, and the voice conversation id) rides in the token + agent dispatch
// metadata so the LiveKit worker knows who it's acting for.
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
      activePersonalityId: true,
      voiceId: true,
    },
  });
  if (!instance) {
    return new Response("No instance", { status: 404 });
  }

  // Both depend only on the instance - run them concurrently; this route is on
  // the call-start critical path, so every serial query is audible latency.
  //
  // Conversation: ONE ongoing voice thread, reused across calls (see below).
  // Intentionally does NOT become the active (text) conversation - voice keeps
  // its own thread, while still inheriting instance-level memory at run time.
  //
  // Personality: its prompt drives Agent A's SPOKEN voice - without it, the
  // voice front falls back to the default Claw character while the text agent
  // uses the personality. Forwarded in the dispatch metadata so voice matches
  // text.
  const activePersonality = instance.activePersonalityId
    ? await db.personality.findFirst({
        where: { id: instance.activePersonalityId, instanceId: instance.id },
        select: { name: true, prompt: true },
      })
    : null;

  // ONE ongoing voice thread, reused across calls (Telegram and cron already
  // work this way). Minting a fresh thread per call meant hanging up and
  // calling back started from nothing: "make that draft shorter" could not
  // work, because the draft lived in the previous call's thread.
  //
  // Found by the voicePersonaId marker rather than the title, so renaming the
  // thread cannot orphan it and a user-titled chat cannot be hijacked into
  // serving as the voice thread.
  //
  // The persona pin is REFRESHED per call: it records the snapshot Agent A is
  // dispatched with, so the two can never disagree. Agent A's instructions are
  // baked for the life of the call and the delegate (Agent B, /api/voice-turn)
  // replays this prompt rather than re-resolving the personality row - which
  // holds even if the user switches, edits, or deletes the personality
  // mid-call. Sentinel "none" records "started on the default voice".
  const personaPin = {
    voicePersonaId: instance.activePersonalityId ?? "none",
    voicePersonaPrompt: activePersonality?.prompt ?? null,
    voicePersonaName: activePersonality?.name ?? null,
  };
  const existingVoiceThread = await db.conversation.findFirst({
    where: { instanceId: instance.id, voicePersonaId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  // Gates the dispatch-failure rollback below: only a thread created by THIS
  // request may be deleted.
  const isNewVoiceThread = !existingVoiceThread;
  const conversation = existingVoiceThread
    ? await db.conversation.update({
        where: { id: existingVoiceThread.id },
        data: personaPin,
        select: { id: true },
      })
    : await db.conversation.create({
        data: {
          instanceId: instance.id,
          title: "Voice call",
          ...personaPin,
        },
        select: { id: true },
      });

  const sessionConfig = JSON.stringify({
    userId,
    instanceId: instance.id,
    conversationId: conversation.id,
    personaId: instance.activePersonalityId ?? null,
    personaName: activePersonality?.name ?? null,
    // Full personality prompt - Agent A adopts this as its spoken character so
    // the voice matches the personality the user picked (same as text chat).
    // Model routing is fully server-side: the worker's realtime model is fixed
    // and /api/voice-turn resolves Agent B's model itself.
    personaPrompt: activePersonality?.prompt ?? null,
    // The user's chosen OpenAI Realtime voice; the worker maps unknown ids
    // (e.g. legacy Smallest ids) to its default.
    voiceId: instance.voiceId ?? DEFAULT_VOICE_ID,
  });

  // Unique room per CALL - deliberately not keyed to the conversation any
  // more, since that thread is now reused across calls and a repeated room
  // name would rejoin a room that may still hold a prior call's agent. Nothing
  // parses this name; the worker reads the conversation id from the dispatch
  // metadata.
  const roomName = `claw_voice_${randomUUID()}`;
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

  // Dispatch the worker EXPLICITLY via the dispatch API - the same reliable path
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
    // Clean up ONLY a thread this request just created. The voice thread is
    // now reused across calls, and messages cascade on delete - so deleting a
    // reused thread here would erase every previous call's history because a
    // dispatch timed out. On the reuse branch there is nothing orphaned.
    if (isNewVoiceThread) {
      await db.conversation
        .delete({ where: { id: conversation.id } })
        .catch(() => undefined);
    }
    return new Response("Couldn't start the voice agent - try again.", {
      status: 503,
    });
  }

  return Response.json(
    { serverUrl, roomName, token, conversationId: conversation.id },
    { headers: { "Cache-Control": "no-store" } },
  );
}
