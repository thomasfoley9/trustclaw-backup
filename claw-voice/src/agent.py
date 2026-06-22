"""Thomas Claw — real-time voice agent (LiveKit cascade), Design C.

Agent A (THIS worker) is the conversational voice front: Smallest Pulse STT ->
a real LLM (a house model — Kimi K2 by default) with the persona + ONE tool,
`delegate` -> Smallest Lightning TTS. Chit-chat A answers directly; real work A
delegates to Agent B by POSTing the intent to the Next.js /api/voice-turn route,
which runs the user's heavy Composio agent on the user's model and streams back
tool activity (forwarded to the 'cockpit' data channel) + a result that A speaks.

Why A is house-only: A runs in LiveKit Cloud, which holds only the owner-funded
house keys. Per-user keys (Claude/custom) live encrypted on Vercel — so B, which
runs there via /api/voice-turn, is the one that uses the user's chosen model.

Session config (userId, conversationId, models, persona) arrives as JSON in the
agent-dispatch metadata from the /api/livekit-token route.
"""

import asyncio
import json
import logging
import os

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    AudioConfig,
    BackgroundAudioPlayer,
    BuiltinAudioClip,
    JobContext,
    RunContext,
    function_tool,
)
from livekit.plugins import openai, smallestai

load_dotenv(".env.local")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("claw-voice")

server = AgentServer()

# Worker -> Vercel bridge.
VOICE_TURN_URL = os.environ.get(
    "VOICE_TURN_URL", "https://thomasclaw.vercel.app/api/voice-turn"
)
WORKER_SECRET = os.environ.get("VOICE_WORKER_SHARED_SECRET", "")

# The agent's CHARACTER (voice/tone). Default when no personality is active;
# overridden by the user's selected personality prompt (passed in the dispatch
# metadata as `personaPrompt`) so the SPOKEN agent takes on that personality,
# matching the text agent.
DEFAULT_CHARACTER = """You are Thomas Claw — a blunt, quick, no-corporate-bullshit personal assistant. Dry wit, zero fluff, zero corporate-speak. You keep it real and get straight to the point."""

# Operational rules — ALWAYS applied, after the character. The character sets the
# VOICE; these set the JOB and never change with personality.
VOICE_FRONT_RULES = """You're talking out loud on a voice call, so keep replies short, natural, and conversational; never read long lists or raw data aloud. Stay fully in the character and voice described above — that voice is who you are on this call, in every reply.

You have ONE tool, `delegate`, which hands a task to the worker that actually does things (email, calendar, Slack, the CRM, files, web lookups, sending/scheduling/changing anything). The worker remembers the whole call, so treat it as your hands.

WHEN TO DELEGATE — anything that touches the user's real accounts, data, or the outside world. This includes the follow-ups:
- The first request ("check my email", "schedule lunch with Sam Friday").
- Their ANSWER to a question you asked, their CONFIRMATION ("yes", "send it", "go ahead"), an EDIT ("make it 3pm instead"), or a follow-up that continues the task. These are NOT small talk — they move real work forward, so you MUST delegate them. Pass what they decided (e.g. "User confirmed — send the email to Sam we drafted" or "Change the meeting to 3pm").

WHEN TO ANSWER DIRECTLY — only pure conversation with no task behind it: greetings, thanks, "how are you", who you are. That's it.

HOW TO DELEGATE:
- Pass a clear, self-contained `intent` that carries EVERY detail the user gave — names, dates, times, the actual message content, which account/tool. Don't make the worker guess; don't drop specifics.
- When you delegate real work, FIRST give ONE short line that acknowledges the task and tells them to hold — in your own voice. Default: "On it — please hold." In character it bends to your personality (e.g. Ramsay: "Right, hold on."; Alfred: "One moment, sir."; the hype bestie: "ok hold up, gimme a sec"). The point is a clear "hold" cue, because soft hold music plays while the worker runs.
- CRITICAL: say that hold line AND call `delegate` in the SAME turn. Never announce a hold without actually delegating — otherwise they wait on silence.
- When the result comes back, give it in one or two spoken sentences, fully in character.

IRON RULE — never say something was done, sent, scheduled, found, replied, or changed unless a `delegate` call actually came back saying so. If you didn't delegate, nothing happened — do not pretend it did. If a delegate result contains a `[SYSTEM: ...]` note, that is the ground truth about what really happened — obey it exactly, over your own assumptions. For anything that sends or is hard to undo, you may read back what's about to happen and get a quick "yes" first — but the instant they say yes, delegate it so it truly executes."""


def build_instructions(config: dict) -> str:
    """Agent A's instructions = the active personality's voice (or the default
    Claw character) + the constant voice-front operational rules. Forwarding the
    user's selected personality here is what makes the SPOKEN agent take on that
    personality, exactly like the text agent does."""
    character = config.get("personaPrompt") or DEFAULT_CHARACTER
    return f"{str(character).strip()}\n\n{VOICE_FRONT_RULES}"


def build_agent_a_llm(agent_a_model: str | None) -> openai.LLM:
    """Agent A's LLM — restricted to house models (the only keys the worker holds).
    The voice front needs LOW LATENCY, not raw power (the heavy multi-tool work is
    Agent B's job), so it defaults to a fast Kimi variant. Tunable without a code
    redeploy via the AGENT_A_MOONSHOT_MODEL secret."""
    moonshot = os.environ.get("MOONSHOT_API_KEY")
    deepseek = os.environ.get("DEEPSEEK_API_KEY")
    if agent_a_model == "house/deepseek" and deepseek:
        return openai.LLM(
            model="deepseek-v4-flash",
            base_url="https://api.deepseek.com/v1",
            api_key=deepseek,
        )
    # kimi-k2.7-code-highspeed: same agentic K2 brain, ~180-260 tok/s vs the much
    # slower kimi-k2.6 — what makes spoken replies snappy. Persona drives the tone.
    moonshot_model = os.environ.get(
        "AGENT_A_MOONSHOT_MODEL", "kimi-k2.7-code-highspeed"
    )
    if not moonshot:
        # Fail loud at startup instead of returning an LLM with api_key=None that
        # silently 401s on the first inference (a deaf, mute agent).
        raise RuntimeError(
            "MOONSHOT_API_KEY is not set on the worker — Agent A has no LLM key."
        )
    return openai.LLM(
        model=moonshot_model,
        base_url="https://api.moonshot.ai/v1",
        api_key=moonshot,
    )


class ClawAgent(Agent):
    def __init__(self, config: dict, room=None, bg_audio=None) -> None:
        # Instructions carry the active personality's voice (or default Claw) so
        # the SPOKEN agent matches the user's selected personality.
        super().__init__(instructions=build_instructions(config))
        self._user_id = config.get("userId", "")
        self._conversation_id = config.get("conversationId", "")
        # The live room, handed in by the entrypoint — used to publish cockpit
        # events. Storing it avoids reaching into ctx.session._room (private, and
        # not guaranteed bound when delegate() streams).
        self._room = room
        # BackgroundAudioPlayer for hold music, played manually for the duration
        # of delegate() so it reliably spans the whole wait.
        self._bg_audio = bg_audio

    @function_tool
    async def delegate(self, ctx: RunContext, intent: str) -> str:
        """Delegate real work to the worker agent. Use for anything involving the
        user's email, calendar, Slack, CRM, files, web, or sending/changing
        anything — INCLUDING the user's confirmations, answers, and edits that
        continue a task already in motion ("yes, send it" / "make it 3pm"). The
        worker remembers the whole call, so pass a clear, self-contained `intent`
        with every detail (names, dates, message content)."""
        logger.info("delegate -> %r", intent)
        # Manually play hold music for the WHOLE handoff. We do this explicitly
        # (rather than the session's thinking_sound) because the spoken "please
        # hold" line flips the agent out of the "thinking" state, so thinking_sound
        # wouldn't span the tool call. Low volume + fade_out so it hands off
        # gently to Claw's voice. Stopped in finally on every exit path.
        hold = None
        if self._bg_audio is not None:
            try:
                hold = self._bg_audio.play(
                    AudioConfig(
                        BuiltinAudioClip.HOLD_MUSIC, volume=0.35, fade_out=0.5
                    ),
                    loop=True,
                )
            except Exception:  # noqa: BLE001 — music is best-effort
                logger.warning("hold music start skipped", exc_info=True)
        try:
            return await self._run_delegate(intent)
        finally:
            if hold is not None:
                try:
                    hold.stop()
                except Exception:  # noqa: BLE001
                    logger.warning("hold music stop skipped", exc_info=True)

    async def _run_delegate(self, intent: str) -> str:
        """The actual handoff to Agent B: POST the intent, stream its tool events
        to the cockpit, and return the receipt-anchored result. Hold music plays
        automatically during this call via the session's thinking_sound."""
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
                            return "My link to the worker isn't set up right — tell Thomas to check the secrets."
                        if resp.status_code == 404:
                            return "I lost track of this conversation — let's start fresh?"
                        return "I couldn't reach the worker just now — try again?"
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
                            return f"That didn't work — {ev.get('message', 'unknown error')}."
        except asyncio.CancelledError:
            # The call ended or the user barged in mid-task. Re-raise so the
            # session shuts down promptly instead of this in-flight request
            # blocking aclose() until the drain timeout force-kills the process
            # (the `aclose timed out` -> `process killed` chain in the logs).
            logger.info("delegate cancelled (call ended or interrupted)")
            raise
        except Exception as e:  # noqa: BLE001 — surface, don't crash the call
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
            # Tools were attempted but only errored — the task did NOT complete.
            return (
                "[SYSTEM: The worker hit tool errors and did NOT complete the "
                "task. Tell the user plainly it didn't go through — do not claim "
                "it's done.]\n\n" + (result_text or "")
            )
        if result_status == "no_action":
            # B ran no tools — it only looked something up or drafted. Block any
            # "it's sent/done" claim; this is the anti-fabrication guardrail.
            base = result_text or "I haven't actually done that yet."
            return (
                base + "\n\n[SYSTEM: The worker took NO action this turn — it "
                "only gathered info or drafted a response. Do NOT tell the user "
                "anything was sent, scheduled, saved, or changed. If an action "
                "still needs to happen, delegate it explicitly.]"
            )
        # executed: at least one tool returned successfully, so result_text
        # reflects real work that happened.
        return result_text or (
            "The worker ran its tools but didn't summarize — tell the user it's "
            "handled and offer to confirm the details."
        )

    async def _publish_cockpit(self, event: dict) -> None:
        """Forward an Agent B tool event to the web cockpit via the data channel.
        publish_data is a coroutine — it MUST be awaited or nothing is sent."""
        room = self._room
        if room is None:
            return
        try:
            payload = json.dumps(event).encode("utf-8")
            await room.local_participant.publish_data(
                payload, reliable=True, topic="cockpit"
            )
        except Exception:  # noqa: BLE001 — cockpit is best-effort
            logger.warning("cockpit publish skipped", exc_info=True)


@server.rtc_session(agent_name="claw-voice")
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

    user_id = config.get("userId")
    logger.info("voice session for user=%s", user_id)
    if not user_id or not config.get("conversationId"):
        logger.error(
            "session config missing userId/conversationId — delegation will fail"
        )
    if not WORKER_SECRET:
        logger.error(
            "VOICE_WORKER_SHARED_SECRET not set — delegate calls will be rejected"
        )

    # The user's chosen voice (Settings -> Voice) rides in the dispatch
    # metadata; fall back to a sensible default if it's missing.
    # IMPORTANT: model + voice must match. The Settings picker offers the
    # standard lightning_v3.1 voices (avery, mia, ...), so the TTS MUST use the
    # standard "lightning_v3.1" model — pairing them with the "_pro" model makes
    # synthesis fail silently (the agent joins but never speaks).
    voice_id = config.get("voiceId") or "avery"
    logger.info("voice session using voice_id=%s", voice_id)
    session = AgentSession(
        stt=smallestai.STT(),
        tts=smallestai.TTS(model="lightning_v3.1", voice_id=voice_id),
        llm=build_agent_a_llm(config.get("agentAModel")),
        # AgentSession bundles a VAD now; no explicit vad= needed.
    )

    # Hold-music player. delegate() plays HOLD_MUSIC through this manually for the
    # full duration of the handoff — reliable coverage of the whole wait, which
    # the session's thinking_sound couldn't guarantee once a spoken "please hold"
    # line dropped the agent out of the "thinking" state mid-turn.
    bg_audio = BackgroundAudioPlayer()

    # Hand the room + player to the agent so delegate() can publish cockpit
    # events and play the hold music.
    await session.start(
        agent=ClawAgent(config, ctx.room, bg_audio), room=ctx.room
    )
    try:
        await bg_audio.start(room=ctx.room, agent_session=session)
    except Exception:  # noqa: BLE001 — ambience is best-effort, never block the call
        logger.warning("background audio player failed to start", exc_info=True)

    # Explicit dispatch can place the agent in the room before the user finishes
    # connecting — wait for them so the greeting isn't spoken into an empty room.
    # Bounded: if the user never joins (dispatch succeeded but their browser
    # failed to connect), end the session instead of sitting idle indefinitely.
    try:
        await asyncio.wait_for(ctx.wait_for_participant(), timeout=60.0)
    except asyncio.TimeoutError:
        logger.warning("no participant joined within 60s — ending session")
        return
    except Exception:  # noqa: BLE001 — API unavailable; greet immediately
        logger.info("wait_for_participant unavailable", exc_info=True)

    # Greet IN CHARACTER: generate_reply runs the LLM with the agent's
    # instructions (which now carry the active personality), so Gordon Ramsay
    # greets like Ramsay, Alfred like Alfred, etc. — instead of a fixed line.
    try:
        await session.generate_reply(
            instructions=(
                "Greet the user in ONE short line, fully in character, and ask "
                "what they need. No menus, no lists of what you can do."
            )
        )
    except Exception:  # noqa: BLE001 — a TTS/LLM hiccup shouldn't kill the session
        logger.warning("greeting failed", exc_info=True)


if __name__ == "__main__":
    agents.cli.run_app(server)
