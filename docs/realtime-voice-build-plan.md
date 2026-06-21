# Real-time voice (LiveKit cascade) — build plan

Status: **planned, not yet built.** Decision locked: streaming **cascade** (not speech-native),
keeping the two-agent A→B, cockpit, house models, and persona. Researched + critiqued via workflow
2026-06-20.

## Architecture (one line)
Browser publishes mic + plays agent audio in a LiveKit room. A **Fly.io Python `AgentServer`
worker** joins the same room: **Smallest Pulse STT** → an `llm_node` override that POSTs each user
turn to a new Next.js **`/api/voice-turn`** SSE route (the existing A→B: house-model Agent B +
Composio tools, then Agent A narrator) → **Smallest Lightning TTS**. Agent B tool events ride a
custom `cockpit` LiveKit data-channel topic; transcript rides the reserved `lk.transcription` topic —
both feed the **existing** React cockpit/chat live mid-call.

## Runtime split
**Vercel (existing app):**
- Frontend: Call/Hang-up UI, `<RoomAudioRenderer/>`, `useTranscriptions()` → chat bubbles,
  `useDataChannel('cockpit')` → existing cockpit pane, StartAudio gesture.
- `POST /api/livekit-token` (nodejs runtime): auth-gated, room = `claw_voice_${userId}`, mints
  `AccessToken` JWT (VideoGrant) with room/participant metadata `{sessionId, personaId, userId}`,
  `await toJwt()`.
- `POST /api/voice-turn` (SSE): the bridge — runs the existing A→B engine, streams
  `{a_token, b_tool, done}`, persists the turn to Neon like `/api/chat`. Verifies a shared secret.
- All Anthropic/DeepSeek/Kimi/Composio execution stays here. **LiveKit never sees the model.**

**Fly (new Python worker):**
- Always-on `AgentServer` worker (no public ingress; `fly scale count 1`, `kill_timeout 600`).
- Per job: `AgentSession(stt=smallestai.STT, tts=smallestai.TTS, vad=silero.VAD.load())`.
- `ClawAgent.llm_node` override = the LLM stage: httpx SSE → `/api/voice-turn`, yields `a_token` to
  TTS, forwards `b_tool` to the `cockpit` data channel.

## Env vars
| Var | Vercel | Fly | Secret |
|---|---|---|---|
| `LIVEKIT_URL` / `NEXT_PUBLIC_LIVEKIT_URL` | ✅ (done) | ✅ | no (URL) |
| `LIVEKIT_API_KEY` | ✅ (done) | ✅ | yes |
| `LIVEKIT_API_SECRET` | ✅ (done) | ✅ | yes |
| `SMALLEST_API_KEY` | — | ✅ | yes (already owned) |
| `DEEPSEEK_API_KEY` / `MOONSHOT_API_KEY` / `ANTHROPIC*` / `COMPOSIO` | ✅ (exist) | — | yes |
| `VOICE_WORKER_SHARED_SECRET` | ✅ | ✅ | yes (worker→Vercel auth) |
| `VOICE_TURN_URL` | — | ✅ | no |

LiveKit creds are now set on **Vercel**; they still need to go on **Fly** when the worker deploys.

## Files to create
- `claw-voice/src/agent.py` — Python `AgentServer` worker (the cascade + `llm_node` bridge).
- `claw-voice/pyproject.toml` — `livekit-agents[smallestai,silero,turn-detector]~=1.5`, httpx.
- `claw-voice/uv.lock`, `Dockerfile` (uv multi-stage, `download-files` to bake VAD/turn weights),
  `.dockerignore`, `fly.toml` (no `http_service`, `performance-2x`, `kill_timeout=600`,
  `primary_region` = LiveKit project region).
- `app/api/livekit-token/route.ts` — token server.
- `app/api/voice-turn/route.ts` — SSE A→B bridge.
- `lib/agents/ab-engine.ts` — **shared A→B module factored out of `/api/chat`** so both paths call
  identical logic (no duplication).
- `components/voice/VoiceCall.tsx` — React connect + mic + audio + transcript + cockpit wiring;
  mutually-exclusive toggle vs the legacy Web Speech path.

## Barge-in
Handled entirely on the Fly worker. `AgentSession` runs Pulse STT (interruptible) + `silero.VAD`
(`allow_interruptions=True`); when the caller talks over the agent, LiveKit stops Lightning TTS and
raises `asyncio.CancelledError` into the in-flight `llm_node` generator. The httpx SSE read MUST be
inside `async with hc.stream(...)` so cancel closes the upstream `/api/voice-turn` cleanly — and the
bridge loop must **re-raise** `CancelledError` (no broad `except Exception`) or we leak a half-run
A→B and risk double-charging tokens / writing a partial turn. Browser keeps the mic published
continuously (no push-to-talk).

## Cockpit + transcript sync (both feed the existing panes)
1. **Transcript** → reserved `lk.transcription`: caller STT + agent speech (Agent A's narration,
   synced to TTS). React reads via `useTranscriptions()`. Don't reuse this topic for anything else.
2. **Cockpit (B tool activity)** → custom `cockpit` topic: `/api/voice-turn` emits
   `{type:'b_tool', name, argsSummary, status}` SSE; the worker forwards each via
   `publish_data(..., topic='cockpit', reliable=True)` (use `send_text`/streams for large Composio
   results — reliable packets cap ~15 KiB). React reads via `useDataChannel('cockpit')`. Same event
   shape as the typed path → no UI fork. Persistence stays in Next.js so text + voice share history.

---

## ⚠️ Critic verdict: NOT execute-ready as written — fix the sequence first

**#1 load-bearing unknown (spike this BEFORE building the bridge):** whether an `AgentSession` with
**no `llm=`** and an `Agent` whose `llm_node` is overridden to act purely as an HTTP/SSE bridge
actually runs end-to-end on the pinned `livekit-agents` 1.x — specifically: (a) the pipeline invokes
the overridden `llm_node` and streams yielded `str` straight to TTS with no real LLM; (b) agent
transcription still publishes to `lk.transcription`; (c) a latency-masking filler can be spoken while
`llm_node` blocks on the first SSE byte (`session.say` should work; `session.generate_reply` likely
won't with no LLM — confirm which); (d) barge-in raises `CancelledError` into the httpx stream
cleanly. **Every official example sets a real `llm=`; this is off-label.** De-risk with a
throwaway-creds spike that yields a *hardcoded* SSE stub to TTS before building the bridge contract or
refactoring A→B.

**Corrected critical path:**
1. **Phase 0 — Spike (moved to front).** Scaffold `claw-voice/` worker; `llm_node` yields a hardcoded
   SSE stub → TTS; prove no-LLM pipeline + `lk.transcription` + filler (`session.say`) + barge-in
   cancel. Needs Smallest key (have) + any LiveKit project (have).
2. **`lib/agents/ab-engine.ts` extraction as its own re-tested step** — factoring A→B out of
   `/api/chat` touches the working typed-chat path; extract + re-verify `/api/chat` BEFORE building
   `/api/voice-turn` on top of it. Not bundled into voice work.
3. **Phase 1 — token route + `/api/voice-turn`** (buildable, no creds to build).
4. **Phase 2 — React connect + cockpit/transcript wiring** (buildable; e2e verify later).
5. **Phase 3 — real creds + deploy worker to Fly + end-to-end** (needs Fly account).
6. **Phase 4 — hardening + ops.**

**Other gaps to fold in (not optional):**
- **First-turn greeting** — nothing speaks on connect; add `on_enter`/`session.say` or users hit
  silence.
- **Server-side abort on barge-in** — `/api/voice-turn` is Vercel serverless; on client disconnect it
  may keep running B's tool loop (spend) unless it checks `request.signal`. Add an abort-aware handler.
- **Interim vs final transcripts** — Pulse emits partials; the cockpit/chat UI expects discrete turns.
  Filter to **final-only** or bubbles spam/dupe.
- **Cockpit event ordering** — over `/api/chat` tool events are in-band/ordered with narration; over a
  separate data channel they race the audio/transcript channel. "Identical shape, no fork" hides a
  real ordering change — coalesce/sequence.
- **Dispatch-failure UX** — if the Fly worker is down/at capacity, the browser joins a room with no
  agent and `useVoiceAssistant` hangs "initializing." Add a timeout + fallback to the legacy path.
- **Verify before coding:** exact Smallest `voice_id`/model string (plugin example uses `'emily'`;
  `'meher'`/`'lightning_v3.1_pro'` are unverified); pin the **acoustic** turn-detector (not the
  deprecated text one); `AgentServer`/`@server.rtc_session` vs `WorkerOptions` (both exist in 1.x —
  most sample code still uses `WorkerOptions`).

## Open questions (answer to finalize)
- LiveKit project **region** (→ Fly `primary_region` for min round-trip).
- Is A→B already factored into a reusable lib, or does step 2 extract it first?
- Dispatch: explicit `RoomConfiguration(agent_name)` in the token vs implicit auto-join?
- Chosen Smallest Lightning `voice_id` for the Claw persona.
- Filler approach during B's tool loop (canned phrase vs other).
- Can a throwaway LiveKit sandbox run the Phase 0 spike before rotated creds, or wait?
- Ship owner-key-only first, add per-user BYO Smallest key (via room metadata) later?
