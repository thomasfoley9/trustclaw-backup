"""Claw - real-time voice agent (LiveKit + OpenAI GPT Realtime).

Agent A (THIS worker) is the conversational voice front: OpenAI's GPT-4o
Realtime model handles speech-to-speech natively (no separate STT/TTS
pipeline) with the persona + ONE tool, `delegate`. Chit-chat A answers
directly; real work A delegates to Agent B by POSTing the intent to the
Next.js /api/voice-turn route, which runs the user's heavy Composio agent on
the user's model and streams back tool activity (forwarded to the 'cockpit'
data channel) + a result that A speaks.

Session config (userId, conversationId, persona) arrives as JSON in the
agent-dispatch metadata from the /api/livekit-token route.
"""

import asyncio
import json
import logging
import os
import sys

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    RunContext,
    function_tool,
)
from livekit.plugins import openai
from openai.types.beta.realtime.session import TurnDetection

load_dotenv(".env.local")
load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("claw-voice")

server = AgentServer()

# Worker -> Vercel bridge.
VOICE_TURN_URL = os.environ.get(
    "VOICE_TURN_URL", "http://localhost:3000/api/voice-turn"
)
WORKER_SECRET = os.environ.get("VOICE_WORKER_SHARED_SECRET", "")

# The agent's CHARACTER (voice/tone). Default when no personality is active;
# overridden by the user's selected personality prompt (passed in the dispatch
# metadata as `personaPrompt`) so the SPOKEN agent takes on that personality,
# matching the text agent.
DEFAULT_CHARACTER = """You are Claw - a blunt, quick, no-corporate-bullshit personal assistant. Dry wit, zero fluff, zero corporate-speak. You keep it real and get straight to the point."""

# Operational rules - ALWAYS applied, after the character. The character sets the
# VOICE; these set the JOB and never change with personality.
VOICE_FRONT_RULES = """You're talking out loud on a voice call, so keep replies short, natural, and conversational; never read long lists or raw data aloud. Stay fully in the character and voice described above - that voice is who you are on this call, in every reply.

You have ONE tool, `delegate`, which hands a task to the worker that actually does things (email, calendar, Slack, the CRM, files, web lookups, sending/scheduling/changing anything). The worker remembers the whole call, so treat it as your hands.

WHEN TO DELEGATE - anything that touches the user's real accounts, data, or the outside world. This includes the follow-ups:
- The first request ("check my email", "schedule lunch with Sam Friday").
- Their ANSWER to a question you asked, their CONFIRMATION ("yes", "send it", "go ahead"), an EDIT ("make it 3pm instead"), or a follow-up that continues the task. These are NOT small talk - they move real work forward, so you MUST delegate them. Pass what they decided (e.g. "User confirmed - send the email to Sam we drafted" or "Change the meeting to 3pm").

WHEN TO ANSWER DIRECTLY - only pure conversation with no task behind it: greetings, thanks, "how are you", who you are. That's it.

HOW TO DELEGATE:
- Pass a clear, self-contained `intent` that carries EVERY detail the user gave - names, dates, times, the actual message content, which account/tool. Don't make the worker guess; don't drop specifics.
- When you delegate real work, say ONE short, natural line that states WHAT you're doing - the way a person would when they turn to look something up. "Let me pull those up." "Checking your calendar now." "One sec, finding that thread." Say it in character (Ramsay: "Right, checking those tickets."; Alfred: "Fetching that for you, sir."). NEVER say "please hold", "one moment please", "stand by", or any other call-centre phrasing - you are a person on a call, not an IVR system.
- CRITICAL: say that line AND call `delegate` in the SAME turn. Never announce that you're looking without actually delegating - otherwise they wait on silence.
- ONE delegate at a time: don't call delegate again until the first result comes back. While you're waiting, behave like a person who's mid-task - it's fine to stay quiet, and equally fine to think out loud briefly ("...still loading", "there's a few here") if the wait runs long. What you must NOT do is answer the question or claim a result before the delegate returns.
- When the result comes back, give it in one or two spoken sentences, fully in character.

IRON RULE - never say something was done, sent, scheduled, found, replied, or changed unless a `delegate` call actually came back saying so. If you didn't delegate, nothing happened - do not pretend it did. If a delegate result contains a `[SYSTEM: ...]` note, that is the ground truth about what really happened - obey it exactly, over your own assumptions. For anything that sends or is hard to undo, you may read back what's about to happen and get a quick "yes" first - but the instant they say yes, delegate it so it truly executes."""


def build_instructions(config: dict) -> str:
    """Agent A's instructions = the active personality's voice (or the default
    Claw character) + the constant voice-front operational rules. Forwarding the
    user's selected personality here is what makes the SPOKEN agent take on that
    personality, exactly like the text agent does."""
    character = config.get("personaPrompt") or DEFAULT_CHARACTER
    return f"{str(character).strip()}\n\n{VOICE_FRONT_RULES}"


OPENAI_VOICES = frozenset(
    {
        "alloy",
        "ash",
        "ballad",
        "cedar",
        "coral",
        "echo",
        "marin",
        "sage",
        "shimmer",
        "verse",
    }
)
DEFAULT_VOICE = "marin"


def build_realtime_model(voice: str) -> openai.realtime.RealtimeModel:
    """Agent A's model - OpenAI GPT-4o Realtime. Handles speech-to-speech
    natively (STT + LLM + TTS in one hop), so the agent session doesn't need
    separate STT/TTS plugins."""
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError(
            "OPENAI_API_KEY is not set on the worker - Agent A has no model key."
        )
    resolved_voice = voice if voice in OPENAI_VOICES else DEFAULT_VOICE
    # gpt-realtime is the GA speech-to-speech model. The -preview 4o variants
    # are gone from this account's model list - using one fails at session
    # start, which presents as the agent joining the room but never speaking.
    #
    # Turn detection: SEMANTIC, not a silence timer. Plain server VAD ends your
    # turn after N ms of quiet, so thinking mid-sentence ("send it to... uh...")
    # gets you cut off, while a crisp finish leaves an awkward gap. semantic_vad
    # runs a classifier over WHAT was said to decide whether the thought is
    # actually finished - the single biggest thing separating "talking to a
    # person" from "talking to a phone tree". eagerness="medium" is the balanced
    # default; "low" waits longer (fewer interruptions, slower back-and-forth),
    # "high" jumps in sooner.
    return openai.realtime.RealtimeModel(
        model="gpt-realtime",
        voice=resolved_voice,
        turn_detection=TurnDetection(
            type="semantic_vad",
            eagerness="medium",
            create_response=True,
            interrupt_response=True,
        ),
    )


class ClawAgent(Agent):
    def __init__(self, config: dict, room=None) -> None:
        # Instructions carry the active personality's voice (or default Claw) so
        # the SPOKEN agent matches the user's selected personality.
        super().__init__(instructions=build_instructions(config))
        self._user_id = config.get("userId", "")
        self._conversation_id = config.get("conversationId", "")
        # The live room, handed in by the entrypoint - used to publish cockpit
        # events. Storing it avoids reaching into ctx.session._room (private, and
        # not guaranteed bound when delegate() streams).
        self._room = room

    @function_tool
    async def delegate(self, ctx: RunContext, intent: str) -> str:
        """Delegate real work to the worker agent. Use for anything involving the
        user's email, calendar, Slack, CRM, files, web, or sending/changing
        anything - INCLUDING the user's confirmations, answers, and edits that
        continue a task already in motion ("yes, send it" / "make it 3pm"). The
        worker remembers the whole call, so pass a clear, self-contained `intent`
        with every detail (names, dates, message content)."""
        logger.info("delegate -> %r", intent)
        return await self._run_delegate(intent)

    async def _run_delegate(self, intent: str) -> str:
        """The actual handoff to Agent B: POST the intent, stream its tool events
        to the cockpit, and return the receipt-anchored result."""
        import httpx  # local import keeps cold start lean

        result_text = ""
        result_status = "no_action"
        result_tools: list[str] = []
        try:
            # Voice-appropriate timeout: a heavy briefing should finish well
            # under this; capping it (vs 300s) means a genuinely stuck task fails
            # in reasonable time instead of dragging the call toward a
            # shutdown-kill.
            async with httpx.AsyncClient(timeout=120) as hc:
                async with hc.stream(
                    "POST",
                    VOICE_TURN_URL,
                    json={
                        "intent": intent,
                        "userId": self._user_id,
                        "conversationId": self._conversation_id,
                    },
                    headers={"Authorization": f"Bearer {WORKER_SECRET}"},
                ) as resp:
                    if resp.status_code != 200:
                        logger.error("voice-turn returned %s", resp.status_code)
                        if resp.status_code == 401:
                            return "My link to the worker isn't set up right - ask whoever runs this instance to check the secrets."
                        if resp.status_code == 404:
                            return "I lost track of this conversation - let's start fresh?"
                        return "I couldn't reach the worker just now - try again?"
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        try:
                            ev = json.loads(line[5:].strip())
                        except json.JSONDecodeError:
                            logger.warning("bad SSE line from voice-turn: %r", line)
                            continue
                        kind = ev.get("type")
                        if kind == "b_tool":
                            await self._publish_cockpit(ev)
                        elif kind == "result":
                            result_text = ev.get("text", "")
                            result_status = ev.get("status", "no_action")
                            result_tools = ev.get("tools", []) or []
                        elif kind == "error":
                            return f"That didn't work - {ev.get('message', 'unknown error')}."
        except asyncio.CancelledError:
            # The call ended or the user barged in mid-task. Re-raise so the
            # session shuts down promptly instead of this in-flight request
            # blocking aclose() until the drain timeout force-kills the process
            # (the `aclose timed out` -> `process killed` chain in the logs).
            logger.info("delegate cancelled (call ended or interrupted)")
            raise
        except Exception as e:  # noqa: BLE001 - surface, don't crash the call
            logger.exception("delegate failed")
            return f"Something went sideways: {e}"
        # The worker's deterministic execution receipt (status computed from B's
        # REAL tool outcomes, not its prose) is A's ONLY source of truth about
        # success. Logged on both planes so "handoff happened but nothing got
        # done" is diagnosable.
        logger.info(
            "delegate result: status=%s tools=%s (%d chars)",
            result_status,
            result_tools,
            len(result_text),
        )
        if result_status == "failed":
            # Tools were attempted but only errored - the task did NOT complete.
            return (
                "[SYSTEM: The worker hit tool errors and did NOT complete the "
                "task. Tell the user plainly it didn't go through - do not claim "
                "it's done.]\n\n" + (result_text or "")
            )
        if result_status == "no_action":
            # B ran no tools - it only looked something up or drafted. Block any
            # "it's sent/done" claim; this is the anti-fabrication guardrail.
            base = result_text or "I haven't actually done that yet."
            return (
                base + "\n\n[SYSTEM: The worker took NO action this turn - it "
                "only gathered info or drafted a response. Do NOT tell the user "
                "anything was sent, scheduled, saved, or changed. If an action "
                "still needs to happen, delegate it explicitly.]"
            )
        # executed: at least one tool returned successfully, so result_text
        # reflects real work that happened.
        return result_text or (
            "The worker ran its tools but didn't summarize - tell the user it's "
            "handled and offer to confirm the details."
        )

    async def _publish_cockpit(self, event: dict) -> None:
        """Forward an Agent B tool event to the web cockpit via the data channel.
        publish_data is a coroutine - it MUST be awaited or nothing is sent."""
        room = self._room
        if room is None:
            return
        try:
            payload = json.dumps(event).encode("utf-8")
            await room.local_participant.publish_data(
                payload, reliable=True, topic="cockpit"
            )
        except Exception:  # noqa: BLE001 - cockpit is best-effort
            logger.warning("cockpit publish skipped", exc_info=True)


# AGENT_NAME override lets a local dev worker register under a different name
# (e.g. claw-voice-dev) so explicit dispatches can't route prod calls to it.
@server.rtc_session(agent_name=os.environ.get("AGENT_NAME", "claw-voice"))
async def entrypoint(ctx: JobContext):
    # Session config from the token route's agent-dispatch metadata (fallback:
    # the human participant's metadata).
    config: dict = {}
    raw = ctx.job.metadata if ctx.job and ctx.job.metadata else ""
    if raw:
        try:
            config = json.loads(raw)
        except Exception:  # noqa: BLE001
            logger.warning("bad job metadata: %r", raw)

    # Warm-keeper ping (cron-dispatched): LiveKit Cloud scales this agent to
    # zero when idle, making the first real call pay a multi-second cold boot.
    # Periodic no-op jobs count as activity and keep the instance hot. Bail
    # before any model/session setup so pings cost nothing.
    if config.get("keepalive"):
        logger.info("keepalive ping - staying warm")
        # Explicit shutdown keeps the framework from logging a "completed
        # without establishing a connection" warning on every ping.
        ctx.shutdown(reason="keepalive")
        return

    user_id = config.get("userId")
    logger.info("voice session for user=%s", user_id)
    if not user_id or not config.get("conversationId"):
        logger.error(
            "session config missing userId/conversationId - delegation will fail"
        )
    if not WORKER_SECRET:
        logger.error(
            "VOICE_WORKER_SHARED_SECRET not set - delegate calls will be rejected"
        )

    voice_id = config.get("voiceId") or DEFAULT_VOICE
    logger.info("voice session using voice=%s", voice_id)
    try:
        session = AgentSession(
            llm=build_realtime_model(voice_id),
        )
    except RuntimeError as e:
        # Missing model key (the boot-time guard covers `start`/`dev`, but the
        # env can still rot on a running worker). Fail the job LOUDLY and shut
        # it down so the client sees a disconnect - never a silent open call.
        logger.critical("cannot start voice session: %s", e)
        ctx.shutdown(reason="voice agent misconfigured (no model key)")
        return

    # Turn-level breadcrumbs: one line per finalized user/assistant item, and
    # any session error. This is what makes "the call was silent" diagnosable
    # from `lk agent logs` instead of a black box.
    @session.on("conversation_item_added")
    def _log_item(ev) -> None:
        try:
            item = ev.item
            text = (item.text_content or "").strip().replace("\n", " ")
            logger.info("turn [%s]: %.200s", item.role, text)
        except Exception:  # noqa: BLE001
            pass

    @session.on("error")
    def _log_error(ev) -> None:
        logger.error("session error: %s", getattr(ev, "error", ev))

    # NOTE: server-side hold music (BackgroundAudioPlayer) was removed - it
    # publishes a SECOND audio track, which mobile browsers won't reliably play
    # and which destabilized the mic after a couple of turns. Hold music will
    # return client-side (a local <audio> loop), which plays on mobile and never
    # touches the WebRTC mic.

    # Hand the room to the agent so delegate() can publish cockpit events.
    await session.start(agent=ClawAgent(config, ctx.room), room=ctx.room)

    # Explicit dispatch can place the agent in the room before the user finishes
    # connecting - wait for them so the greeting isn't spoken into an empty room.
    # Bounded: if the user never joins (dispatch succeeded but their browser
    # failed to connect), end the session instead of sitting idle indefinitely.
    try:
        await asyncio.wait_for(ctx.wait_for_participant(), timeout=60.0)
    except asyncio.TimeoutError:
        logger.warning("no participant joined within 60s - ending session")
        return
    except Exception:  # noqa: BLE001 - API unavailable; greet immediately
        logger.info("wait_for_participant unavailable", exc_info=True)

    # Greet via generate_reply - say() needs a TTS plugin, which a RealtimeModel
    # session doesn't have (it raises RuntimeError and the call starts silent).
    # GPT Realtime's first-token latency is low enough that the generated
    # greeting still lands fast, and it comes out in the active personality's
    # voice. It stays interruptible.
    try:
        await session.generate_reply(
            instructions=(
                "Greet the user with ONE short line in character and ask what "
                "they need. Nothing else."
            )
        )
    except Exception:  # noqa: BLE001 - a greeting hiccup shouldn't kill the session
        logger.warning("greeting failed", exc_info=True)


if __name__ == "__main__":
    # Fail fast at worker boot: without a model key every call would join and
    # sit silent, which is undebuggable from the client. Only gate the worker
    # modes - build-time invocations (e.g. `download-files` in the Dockerfile)
    # legitimately run without secrets.
    if any(arg in ("start", "dev") for arg in sys.argv[1:]) and not os.environ.get(
        "OPENAI_API_KEY"
    ):
        logger.critical(
            "OPENAI_API_KEY is not set - the voice agent cannot serve calls. "
            "Set it on the worker and restart. Refusing to boot."
        )
        raise SystemExit(1)
    agents.cli.run_app(server)
