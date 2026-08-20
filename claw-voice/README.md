# claw-voice - Thomas Claw real-time voice agent (LiveKit cascade)

A separate **Python** worker (LiveKit Agents 1.x) that runs the real-time voice
plane: **Smallest Pulse STT → A→B bridge → Smallest Lightning TTS**, with
barge-in. It's Python because the first-party Smallest LiveKit plugin is
Python-only. The Next.js app stays the frontend + token server + the A→B brain
(`/api/voice-turn`). Full design: `../docs/realtime-voice-build-plan.md`.

---

## ▶ Phase 0 - the spike (do this FIRST, before anything else gets built)

`src/agent.py` currently yields a **hardcoded stub** - no real model, no HTTP
call. Its only purpose is to de-risk the one off-label assumption the whole plan
rests on: an `AgentSession` with **no `llm=`**, whose `Agent.llm_node` streams
plain strings straight to TTS.

**The spike passes only if all four hold:**
1. The agent **speaks the stubbed reply** - proving the pipeline calls the
   overridden `llm_node` with no LLM in the session.
2. The **greeting** (`session.say(...)`) plays on connect - `say()` works with no LLM.
3. **Transcripts** appear (your speech + the agent's) via `lk.transcription`.
4. **Barge-in**: talking over the agent cuts it off cleanly - no crash/traceback.

### Run it locally (no Fly needed)
```bash
# 1. Install uv:  https://docs.astral.sh/uv/getting-started/installation/
# 2. Secrets:
cp .env.example .env.local
#    fill LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET / SMALLEST_API_KEY
# 3. Install + bake VAD/turn weights:
uv sync
uv run src/agent.py download-files
# 4. Start the worker (connects out to your LiveKit Cloud project):
uv run src/agent.py dev
```
Then open the **LiveKit Agents Playground** (https://agents-playground.livekit.io),
connect it to the same project, and talk. The worker joins as `claw-voice`.

### Likely first-run snags (all expected - this is a spike)
- **No audio / agent never hears you** → add `await ctx.connect()` as the first
  line of `entrypoint()` in `src/agent.py`.
- **`smallestai.STT()` errors on model** → pass the explicit Pulse model arg
  (check the plugin's docs for the exact string).
- **Session refuses to start with no `llm=`** → that's the headline finding;
  ping me and we adjust the bridge design (e.g. a no-op LLM shim).
- **`session.say` not found / needs an LLM** → note it; the greeting/filler
  strategy changes.

Record which of these you hit - each one is a real answer the spike exists to get.

---

## Next (only after the spike passes)
- **Phase 1:** replace the stub in `llm_node` with an `httpx` SSE call to
  `VOICE_TURN_URL` (`/api/voice-turn`), yielding Agent A tokens to TTS and
  forwarding Agent B tool events to the `cockpit` data channel. Build the
  Next.js token route + `/api/voice-turn` + the React `VoiceCall` component.
- **Phase 3 (deploy) - LiveKit Cloud managed hosting (no Fly needed):**
  deploy the worker straight to LiveKit Cloud with `lk agent create` /
  `lk agent deploy` (auto-scaling, same LiveKit account). Set agent secrets
  (`SMALLEST_API_KEY`, `VOICE_WORKER_SHARED_SECRET`, `VOICE_TURN_URL`) via the
  `lk` CLI / dashboard. LiveKit Cloud builds from this `Dockerfile`.
  - **Fallback (self-host):** `fly launch --no-deploy` → `fly secrets set ...` →
    `fly deploy`. `fly.toml` is scaffolded for this path only.
