"""Thomas Claw — real-time voice agent (LiveKit cascade).

PHASE 0 SPIKE. This file's only job right now is to DE-RISK the one off-label
assumption the whole plan rests on (see docs/realtime-voice-build-plan.md):

  An AgentSession with NO `llm=`, whose Agent.llm_node is overridden to stream
  plain strings straight to TTS, driven by Smallest Pulse STT + Lightning TTS,
  with working barge-in — and a `session.say()` greeting with no LLM present.

Every official LiveKit example sets a real `llm=`. We don't. So before we build
the Next.js /api/voice-turn bridge or refactor the existing A->B engine, this
spike yields a HARDCODED stub (no real model, no HTTP call) and must confirm:

  1. The pipeline actually calls the overridden llm_node and speaks the yielded
     text — with no LLM in the session.
  2. session.say() works for a greeting with no LLM.
  3. lk.transcription publishes both your speech and the agent's.
  4. Talking over the agent cancels it cleanly (barge-in) — no crash, the
     CancelledError propagates.

If all four hold -> Phase 1 replaces the stub in `llm_node` with an httpx SSE
call to https://thomasclaw.vercel.app/api/voice-turn (the existing A->B engine).

Run it: see README.md (uv run src/agent.py dev + the LiveKit Agents Playground).
"""

import asyncio
import logging
from typing import AsyncIterable

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    ModelSettings,
)
from livekit.agents.llm import ChatContext, FunctionTool
from livekit.plugins import silero, smallestai

# Local dev secrets (LIVEKIT_*, SMALLEST_API_KEY). Never committed — see
# .env.example. On Fly these come from `fly secrets`, so the missing file is
# fine in production.
load_dotenv(".env.local")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("claw-voice-spike")

server = AgentServer()


class ClawSpikeAgent(Agent):
    """Agent whose llm_node IS the LLM stage — a hardcoded stub for the spike.

    Phase 1: the stub body becomes an httpx SSE bridge to /api/voice-turn that
    yields Agent A's narration tokens and forwards Agent B's tool events to the
    'cockpit' data channel.
    """

    def __init__(self) -> None:
        # `instructions` is unused at runtime (there is no LLM to read it); the
        # backend A->B engine owns all reasoning. Kept for clarity/future use.
        super().__init__(
            instructions="Claw voice agent — the backend A->B engine owns all logic."
        )

    async def llm_node(
        self,
        chat_ctx: ChatContext,
        tools: list[FunctionTool],
        model_settings: ModelSettings,
    ) -> AsyncIterable[str]:
        last = chat_ctx.items[-1] if chat_ctx.items else None
        user_text = (getattr(last, "text_content", None) or "").strip() or "nothing"
        logger.info("llm_node received user turn: %r", user_text)

        # --- SPIKE STUB: no real LLM, no network. Just prove str -> TTS. ---
        # Stream word-by-word with small gaps so we can (a) confirm TTS starts on
        # the FIRST yield (not after the whole reply) and (b) test barge-in by
        # talking over it. The asyncio.sleep is the cancellation point: on
        # barge-in LiveKit raises CancelledError HERE. We must let it propagate
        # (no broad `except Exception`) — in Phase 1 this is what closes the
        # upstream /api/voice-turn request cleanly.
        reply = (
            f"You said: {user_text}. This is the Claw voice spike talking. "
            "There is no language model in this pipeline yet — just a hardcoded "
            "stream proving the cascade works. Try talking over me to test "
            "barge-in."
        )
        for word in reply.split(" "):
            yield word + " "
            await asyncio.sleep(0.08)


@server.rtc_session(agent_name="claw-voice")
async def entrypoint(ctx: JobContext):
    logger.info("starting claw-voice session for room %s", ctx.room.name)

    session = AgentSession(
        # Smallest Pulse STT (streaming, interruptible). VERIFY: confirm the
        # default model is Pulse for your plugin version; pass model=... if not.
        stt=smallestai.STT(),
        # Smallest Lightning TTS. 'meher' is the Pro default voice; swap to the
        # chosen Claw persona voice once picked. `speed` is supported (0.5-2.0).
        tts=smallestai.TTS(model="lightning_v3.1_pro", voice_id="meher"),
        # Silero VAD drives barge-in detection. (turn-detector plugin can be
        # added later for smarter end-of-utterance; VAD is enough for the spike.)
        vad=silero.VAD.load(),
        # DELIBERATELY no llm= — ClawSpikeAgent.llm_node IS the LLM stage. If the
        # framework refuses to start a session without an llm, THAT is the
        # spike's headline finding and we adjust the bridge design.
    )

    await session.start(agent=ClawSpikeAgent(), room=ctx.room)

    # Greeting via say() (NOT generate_reply, which needs an LLM). Confirms
    # TTS-only output works with no LLM present, and gives the caller something
    # to barge in on immediately.
    await session.say(
        "Hey — you're connected to the Claw voice spike. Say something and I'll "
        "echo it back. Talk over me any time to test barge-in."
    )

    # NOTE: if the agent never hears you, add `await ctx.connect()` as the first
    # line of this entrypoint (some templates require it before session.start).


if __name__ == "__main__":
    # cli.run_app gives subcommands: dev | start | download-files | connect.
    agents.cli.run_app(server)
