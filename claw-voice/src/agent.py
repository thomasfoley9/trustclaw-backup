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

PERSONA = """You are the voice of Thomas Claw — a blunt, quick, no-corporate-bullshit personal assistant. You're talking out loud on a call, so keep replies short, natural, and conversational; never read long lists or raw data aloud.

You have ONE tool, `delegate`. Use it for ANYTHING that touches the user's real accounts or tools — email, calendar, Slack, the CRM, files, web lookups, sending or changing anything. Pass a clear, self-contained `intent`. For plain conversation, questions about yourself, or quick acknowledgements, just answer directly — do NOT delegate.

When you delegate, say a short natural line first so they're not left in silence ("on it — checking now"). When the result comes back, summarize it in one or two spoken sentences, in character. If something needs sending or saving (an email, a CRM write), read back what's staged and ask them to confirm before it goes out."""


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
    def __init__(self, config: dict, room=None) -> None:
        super().__init__(instructions=PERSONA)
        self._user_id = config.get("userId", "")
        self._conversation_id = config.get("conversationId", "")
        # The live room, handed in by the entrypoint — used to publish cockpit
        # events. Storing it avoids reaching into ctx.session._room (private, and
        # not guaranteed bound when delegate() streams).
        self._room = room

    @function_tool
    async def delegate(self, ctx: RunContext, intent: str) -> str:
        """Delegate real work to the worker agent. Use for anything involving the
        user's email, calendar, Slack, CRM, files, web, or sending/changing
        anything. `intent` is a clear, self-contained description of the task."""
        import httpx  # local import keeps cold start lean

        logger.info("delegate -> %r", intent)
        result_text = ""
        try:
            async with httpx.AsyncClient(timeout=300) as hc:
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
                        elif kind == "error":
                            return f"That didn't work — {ev.get('message', 'unknown error')}."
        except Exception as e:  # noqa: BLE001 — surface, don't crash the call
            logger.exception("delegate failed")
            return f"Something went sideways: {e}"
        return result_text or "Done — though I didn't get much back."

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
    voice_id = config.get("voiceId") or "avery"
    logger.info("voice session using voice_id=%s", voice_id)
    session = AgentSession(
        stt=smallestai.STT(),
        tts=smallestai.TTS(model="lightning_v3.1_pro", voice_id=voice_id),
        llm=build_agent_a_llm(config.get("agentAModel")),
        # AgentSession bundles a VAD now; no explicit vad= needed.
    )

    # Hand the room to the agent so delegate() can publish cockpit events.
    await session.start(agent=ClawAgent(config, ctx.room), room=ctx.room)

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

    try:
        await session.say("Hey — Thomas Claw here. What do you need?")
    except Exception:  # noqa: BLE001 — a TTS hiccup shouldn't kill the session
        logger.warning("greeting failed", exc_info=True)


if __name__ == "__main__":
    agents.cli.run_app(server)
