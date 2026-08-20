# Thomas Claw - Audio Mode: Final Infra, Migration & Build Plan

> Generated 2026-06-19 from the `voice-infra-scaling` deep-research workflow (10 agents, web + codebase, adversarially reviewed). Companion voice-provider research (TTS/STT/realtime-vs-cascaded picks) is pending and will be appended. **Status: greenlight decision doc.**
> Target scale: tens of concurrent voice sessions now, headroom to ~200 DAU before any tier flip.

---

## 1. TL;DR

Keep the Next.js app on **Vercel** as the control plane (auth, UI, settings, ephemeral-token mint). Add **LiveKit Cloud (Ship tier, $50/mo)** as the managed media plane, a real-time **Concierge** runtime and an async **agent-worker** tier on **Fly.io** Machines (two separate auto-scaled pools), **BullMQ on Upstash Redis (Fixed 1 GB, $20/mo)** for the job queue + completion bus, and **Neon Postgres + pgvector** (pooled endpoint) as the system of record. Per-user BYO keys (Claude, Composio, voice) are decrypted job-scoped inside the workers, never put on the queue. Total platform cost ~$300/mo; per-user LLM/voice spend rides on users' own keys and must be cost-capped from day one. The design is genuinely *relocation, not rebuild* for the async tier - the agent loop is already detached from the HTTP request - which makes Phases 1–2 low-risk and independently valuable to the existing text product.

**The single biggest risk:** **there is no Node Anthropic plugin for LiveKit Agents** (Anthropic is Python-only). Running Claude through the Node Concierge requires a hand-written `llmNode` override that re-marshals the existing AI-SDK `ToolLoopAgent` `fullStream` - including tool-call deltas, barge-in, and abort - into LiveKit's `ChatChunk` contract. That bridge is the project's critical path, is currently unestimated, and **must be de-risked with a 1-week end-to-end spike before Phase 3 is greenlit.** Everything downstream (Composio-in-voice, the confirm flow) depends on it.

---

## 2. Target Architecture

### Components, hosts, and concrete picks

| Plane | Pick | Host | Rationale |
|---|---|---|---|
| **App shell + token mint** | Next.js 15 / tRPC, Better Auth | **Vercel** (existing) | Control plane: auth, UI, settings CRUD, ephemeral-token mint, resumable text SSE. No long-running compute. |
| **Media plane (WebRTC)** | **LiveKit Cloud, Ship $50/mo** | LiveKit | One vendor for transport + agent framework + per-session process isolation. OSS server keeps the *transport* portable (URL change). The Agents-framework code is **not** portable by URL change - see lock-in below. |
| **Concierge (real-time voice)** | **LiveKit Agents - language TBD by spike (lean Node, fall back Python)** | **Fly.io** warm pool | Node reuses the loop logic and stays single-language **but requires the custom `llmNode` Claude bridge**. Python gets the mature Anthropic plugin but is a second language + re-implements the loop. Decide after the spike (§8). |
| **Async agent workers** | **BullMQ `Worker` consuming the agent queue** | **Fly.io** Machines, queue-depth autoscaled, separate pool | No timeout cap, per-second billing, scale-to-zero. Cloud Run's 60-min WS cap kills the Concierge (not the short async jobs). Railway is the same-Dockerfile fallback (~$80/mo). |
| **Job queue + completion bus** | **BullMQ + Redis** | self-operated on Upstash | Redis already in stack (`src/server/clients/redis.ts` pub/sub helpers). One dependency carries queue + cancel channel + completion events. |
| **Redis provider** | **Upstash Redis, Fixed 1 GB ($20/mo)**, `maxmemory-policy=noeviction`, AOF on | Upstash | **Not** pay-as-you-go - BullMQ blocking polls inflate command counts ~10×. Co-locate region with Neon. |
| **Data + memory** | **Neon Postgres + pgvector** (existing) | Neon | System of record. **Workers must use the pooled (PgBouncer) connstring** to survive pool fan-out. |
| **Completion transport** | **Redis pub/sub now → Redis Streams (consumer groups) earlier than originally planned** | Upstash | Worker→Concierge stays on our bus so the media plane stays managed and the job plane scales independently. At-least-once delivery is a Phase-3 concern. |
| **Observability** | LiveKit Agents OTel spans + Prometheus (port 8081) → Grafana/Tempo, or LiveKit managed initially | - | One correlation ID stitched mint → session → BullMQ job → Composio call. |

### Why this rests on a verified fact

The load-bearing structural claim is **true and verified in-repo**: `prepareAgentRun()` (`setup.ts:91`) has zero Next/tRPC imports; `agent.stream()` runs against a server-side `runController.signal` (not the request signal) and is drained inside Vercel's `after()` (`chat/route.ts:248–295`). Closing the tab detaches the viewer but the run continues. So the **async worker tier is a relocation of an already-detached run**, not a greenfield extraction. This is why Phases 1–2 are low-risk and worth shipping for the existing text product *regardless of whether voice is greenlit.*

The **voice front door is a different risk class** - it does not inherit that "relocate, don't rebuild" confidence, because the LiveKit Agents integration (and specifically the Claude `llmNode` bridge) is genuinely new code with no in-repo precedent.

### Data flow (happy path, long tool call)

```
Browser (@livekit/components-react, useVoiceAssistant)
  │ 1. POST /api/voice/token  (Better Auth cookie)
  ▼
Vercel mint  ── validates app session → mints TWO tokens:
  │   (a) LiveKit JWT  ttl=10m, scoped room+identity, dispatch metadata {userId, instanceId}
  │   (b) worker-auth JWT  (signed by mint, carries SERVER-VERIFIED userId + sessionId)
  ▼
LiveKit Cloud (SFU) ── explicit dispatch ──▶ Concierge (Fly, warm pool)
                                              │ builds per-session clients from BYO keys
   user: "email Alex the Q3 numbers"          │  (Claude via llmNode bridge, STT/TTS, Composio)
                                              ▼
                          Concierge detects long/side-effect tool:
                            ├─ say "Let me pull that up…" (barge-in allowed)   ← bridges silence #1
                            ├─ enqueue BullMQ job {jobId=sessionId+turnId, userId, keyRef, action}
                            ├─ start timeout-gated progress narrator (fires @0.5–2s)
                            └─ returns control - conversation stays LIVE
                                              │
   Async worker (Fly, autoscaled)             ▼
     ├─ validate worker-auth JWT → fetch+decrypt THIS user's keys (job-scoped, in-memory)
     ├─ run agent-runner (Claude + Composio) with AbortSignal threaded into EVERY call
     ├─ on WRITE/SEND/DELETE: PAUSE, persist pending state to Neon, publish confirm-required
     ├─ persist run + result to Neon (by jobId)
     └─ PUBLISH voice:done:{sessionId} {jobId, status, summary}
                                              │
                          Concierge (subscribed to its sessions) receives event
                            ├─ cancel progress narrator atomically
                            ├─ liveness + relevance check (session up? still the topic?)
                            └─ speak the result   ← bridges silence #2
```

---

## 3. Async-Job + Completion-Event Mechanism

**Enqueue.** The Concierge's long-tool handler enqueues a BullMQ job keyed `jobId = sessionId + turnId` (the idempotency key - critical because Composio side effects must not double-fire on retry) with `{userId, keyRef, action, conversationId}`. **No plaintext secrets on the queue** - only a key reference + userId.

**Execute.** A Fly worker pops the job, validates the worker-auth JWT, decrypts the user's keys job-scoped, and runs `agent-runner` with an `AbortSignal` threaded into Claude *and* Composio. `lockDuration` is set **above the longest expected tool step** with lock renewal, so multi-minute jobs aren't declared stalled and re-run.

**Bridge the two silences.** Silence #1 (between the utterance and the first progress word) is covered by an immediate "Let me pull that up…" plus a timeout-gated progress narrator. Silence #2 (between job completion and speaking the result) is covered by the completion event.

**Completion delivery - durable from Phase 3, not Phase 5.** Bare Redis pub/sub is fire-and-forget: if the Concierge process holding the session restarts or briefly disconnects at publish time, the result vanishes - and "the job that never spoke back" is the single worst voice UX. So Phase 3 ships **both**:
1. The worker **persists terminal job state to Neon** (`jobId, sessionId, status, summary, spokenAt=null`) *before* publishing.
2. On Concierge **(re)connect/session-resume**, it **reconciles**: query Neon for any `status=done AND spokenAt IS NULL` jobs for its active sessions, speak them, then stamp `spokenAt`. Pub/sub is the fast path; the Neon reconcile is the at-least-once backstop.
3. Migrate the live bus from pub/sub to **Redis Streams consumer groups** as soon as dogfooding shows a single missed completion.

**Confirm interrupts the flow.** A WRITE/SEND/DELETE tool does *not* execute in the worker. The worker pauses, persists pending state (survives restart), publishes `confirm-required` with the exact payload. The Concierge reads it back verbally **and** the browser renders a Confirm/Cancel card. Only explicit verbal "yes" or the button publishes `voice:resume:{jobId}` to resume (§5).

**Double-speak race.** The progress narrator and completion event can fire near the boundary; the narrator is cancelled **atomically** before the result is spoken, gated on the SpeechHandle/turn state.

---

## 4. Migration: Extracting the Claude+Composio Loop into the Worker Tier

Incremental and file-level. Phases 1–2 ship on Vercel with **no behavior change** and deliver standalone value (they kill the `after()` timeout ceiling and the single-node rate-limit map for the existing text product).

### Phase 1 - Factor the loop into a portable runner

**Create `src/server/workers/agent-runner.ts`** - the single portable entry both Vercel and workers call:
```ts
export async function runAgent(input: {
  instanceId: string; userMessage: string;
  source: "web" | "voice" | "telegram" | "cron";
  conversationId?: string; attachments?: Attachment[];
  abortSignal: AbortSignal;                    // threaded into Claude + Composio
  onProgress?: (p: ProgressEvent) => void;     // for voice progress narration
}): Promise<{ conversationId: string; result: AgentResult }>
```
Wraps the *existing* `prepareAgentRun` + `agent.stream()` + the `for await (part of result.fullStream)` settle loop currently in `after()`. Pure relocation, no logic change.

**Create `src/server/clients/job-queue.ts`** - thin BullMQ wrapper (`enqueue`, `cancel`, `subscribeCompletion`) over the existing `getRedis/getRedisPublisher/getRedisSubscriber`. Keep it thin so a future Temporal/Trigger swap stays contained. *(Requires the BullMQ dependency - a dependency-approval gate; deferred to the Phase 2 slice where the consumer exists.)*

**Modify `src/app/api/chat/route.ts`** to call `runAgent` instead of `prepareAgentRun` directly. Proves the seam on Vercel before any worker exists.

**Modify rate limiting now:** replace the in-memory sliding window (`chat/route.ts:30`) with a Redis-backed limiter on the same `ioredis`. Single-node maps break the instant a second tier exists.

**Add the per-user VOICE key to the data model now (gap closed).** `prisma/schema.prisma` today has only `composioApiKey`, `anthropicApiKey`, and `CustomModel.providerApiKey` - **there is no voice key column.** Add:
- `voiceApiKey` (+ `voiceProvider`) column(s), encrypted via the existing `crypto.ts` AES-256-GCM helper extended to all three key types.
- tRPC CRUD + a settings-UI field, mirroring the existing Composio/Anthropic key flow.

*Effort: ~3–4 days.* Risk: low.

### Phase 2 - Stand up the worker container

**Create `src/workers/agent/index.ts`** - Docker entrypoint: a BullMQ `Worker` consuming the agent queue, calling `runAgent`, persisting to Neon, publishing completion. Reuses `db.ts`, `crypto.ts`, `composio.ts`, `mcp.ts`, `resolve-model.ts` **verbatim**.

**Create `Dockerfile.worker`, `fly.worker.toml`, `docker-compose.yml`** (local Redis + worker for integration tests). **Add `pino` structured logging.**

**Relocate post-response tasks:** `runPostResponseTasks()` (compaction + memory flush, today via `after()`) becomes its own BullMQ job enqueued on completion.

**Switch Telegram/cron to enqueue, with dedup.** `telegram-webhook` and `cron` routes move from inline-run to *enqueue* - they **bypass the voice confirm UI entirely**, so they must inherit the same `jobId` idempotency/dedup key to prevent double-delivery of a side-effectful tool.

*Effort: ~3–5 days.*

### Phase 3 - Concierge + voice front door

**Create `src/workers/concierge/index.ts`** - LiveKit Agents entrypoint. **Implementation is gated on the spike (§8).** In Node, this is `defineAgent` + `voice.AgentSession` + a **custom `llmNode` override** wrapping the AI-SDK `ToolLoopAgent` `fullStream` into LiveKit `ChatChunk` (tools defined with `llm.tool()` + Zod). Builds Claude/STT/TTS/Composio clients inside the per-session entrypoint from dispatch metadata → per-user BYO keys automatic.

**Create `src/app/api/voice/token/route.ts`** - the Vercel dual-token mint (§5).

**Add browser `useVoiceAssistant` component**; wire dispatch metadata; subscribe to `voice:done:{sessionId}`; implement the Neon reconcile path from §3.

*Effort: treat as a research spike, then ~5–7 days of build **after** the bridge is proven.*

**Net split after migration:** Vercel keeps auth/UI/settings/mint/text-SSE; workers own all agent loops, compaction, memory flush, Telegram/cron execution, and voice.

### Correctness items that must be tested explicitly (not assumed)
- **Does `abortSignal` actually abort an in-flight `@composio/vercel` tool execution**, or only the next LLM step? If only the latter, a "cancelled"/hung-up session can still fire a side effect - a safety bug, not just UX. Verify in Phase 2.
- **Voice sessions must never fall back to the owner's gateway key.** `resolve-model.ts` routes some models through a gateway fallback when no BYO key is present; a voice session silently using Thomas's gateway key would put user traffic on Thomas's invoice and break the cost model. Assert BYO-or-fail for voice.

---

## 5. Security, Multi-Tenancy, and the Confirmation Pattern

A shared Docker worker pool has **no hardware isolation between tenants** - security lives in the app/authz layer.

### A. Per-user BYO-key isolation
- **Extend `crypto.ts` AES-256-GCM** (today only `composioApiKey`) to all three key types.
- **Decrypt-per-job, job-scoped.** Plaintext key in a local variable that dies when the handler returns. **Never** in the BullMQ payload (it lives in Redis), logs, or error/stack objects. Queue carries `keyRef + userId`, never raw secrets.
- **Authz is the real boundary.** Every job **re-validates userId ownership before fetching keys.** Crypto only contains blast radius; the worker-auth JWT (server-verified userId, validated before key decrypt) is the actual tenant boundary.
- **Envelope encryption** with per-user DEK wrapped by a KMS-held KEK is the scaled-phase target. Phase 1 keeps the single env-var `ENCRYPTION_KEY` KEK - **frozen during migration**, because rotating it mid-flight makes Vercel-encrypted keys undecryptable on workers.

### B. Confirmation pattern for side-effectful actions (enforced server-side in the worker - never trust the model to self-police)
1. **Classify every Composio tool** by an allow/deny list: `READ` → auto-execute; `WRITE/SEND/DELETE` → verbal confirm; `PAY / bulk-delete` → verbal **+ visual** dual-confirm or blocked.
2. On a confirm-required action the worker **pauses** (does not execute), persists pending state to Neon (survives restart), publishes `confirm-required` with the exact payload.
3. Concierge **reads it back verbally** ("I'm about to email alex@x.com saying X - send it?") **and** the browser renders a Confirm/Cancel card showing recipient/body/amount (catches mis-transcribed "yes").
4. Explicit verbal yes or button → `voice:resume:{jobId}` → worker executes.

### C. Prompt-injection - the sharp voice risk
Indirect injection (a poisoned email body or Composio tool description read into context) is a confused-deputy problem access controls don't solve. **Residual risk the confirm gate does *not* close:** READ actions auto-execute, and a poisoned READ result can steer a later *confirmed* WRITE that a human approves under social-engineering framing. Pre-scale defenses: allowlist/pin the specific Composio tools each user enabled, treat tool descriptions as untrusted, keep confirm-before-write as the human backstop. The structural fix (Dual-LLM/quarantine - privileged planner never sees raw untrusted content) is a scaled-phase item, and is an *accepted residual risk* for launch.

### D. Auth, ephemeral tokens, and cost caps (pulled forward)
- Browser **never** holds `LIVEKIT_API_SECRET`. The mint issues the LiveKit JWT (`ttl=10m`, scoped) + worker-auth JWT (server-verified userId, validated before decrypt).
- **Abuse caps at the mint:** per-user concurrent-session cap, max session duration, capped reconnects.
- **Cost-runaway caps - in Phase 3/4, NOT Phase 5.** BYO keys are invisible on *your* invoice, so a looping agent or injection-driven loop on one user's key is the most probable early incident, and it will happen during dogfooding. Ship per-session token/cost budget that **terminates before the next API call at ceiling**, a fleet-level aggregate kill/alert, and provider-429 handling, as part of the voice MVP.
- **Queue isolation:** separate BullMQ queues for realtime-concierge vs async-agent work + per-userId concurrency limits.

---

## 6. Cost, Bottlenecks, Observability

### Platform bill - what *you* pay (~27k voice-min/mo, 25 peak concurrent, ~40% spawn a Composio job)

| Component | Sizing | Monthly |
|---|---|---|
| LiveKit Cloud | Ship $50 + ~22k agent-min overage @ $0.01 (= $50 + $220) | **~$270** |
| Concierge workers (Fly) | 3× performance-1x / 2 GB, warm 24/7 | ~$97 |
| Async agent workers (Fly) | 2× performance-1x / 2 GB, queue-depth autoscaled | ~$64 |
| Redis | Upstash Fixed 1 GB | $20 |
| Neon (pgvector) | Launch/Scale band, pooled endpoint | $19–69 |
| Observability | Grafana+Tempo self-host or LiveKit managed | $0–100 |
| Vercel shell | existing | $20–50 |
| **Total platform** | | **~$300/mo typical (range $230–380)** |

**BYO (billed to users via their keys, not you):** STT ~$208, TTS ~$300–1,600, Claude ~$400–900, Composio ~$29 plan → **~$0.04–0.11/session, ~$900–2,700/mo aggregate.** This is a **product surface you meter and cap**, not your cost - but **your cost-cap enforcement is the only thing between a user and a surprise bill** (§5D).

### What breaks first (cost is *last*)
1. **Per-process Concierge density.** "3× warm @ 8–12 sessions each" for 25 peak has thin headroom and assumes one Node event loop can host 8–12 simultaneous real-time pipelines (VAD+STT+LLM+TTS) without jitter. **This density is asserted, not validated - load-test it in the spike.** Never share a process between latency-sensitive voice and multi-minute jobs; keep the pool warm (cold start blows the <1.5s budget).
2. **BullMQ/Redis backpressure** from the 40% async jobs → queue age climbs, completion lags → motivates the Redis Streams migration.
3. **Per-user LLM/voice spend + provider 429s** on BYO keys.
4. **Neon connection limits** as the pool scales - pooled endpoint mandatory.
5. **LiveKit Ship→Scale flip ($50 → $500 base, a 10× step)** past ~50–60k agent-min/mo (~200 DAU). Model it before you hit it.

### Observability
LiveKit Agents emits per-turn OTel spans (STT, **LLM TTFT**, TTS time-to-first-byte, tool timings, e2e) + Prometheus on 8081 → Tempo/Honeycomb + Grafana. **Mint one correlation/trace ID at session start**, propagate as OTel baggage + a BullMQ job field + Composio call metadata. **Alarm on P95/P99, not means:** time-to-first-word <800ms (1.5s+ = abandonment), e2e P90 <3.5s / P99 <5s, dropped-session rate, job failure rate + duration P95, queue depth/age, per-user spend, BYO 429 rate.

---

## 7. Phased Build Plan

| Phase | Goal | Effort |
|---|---|---|
| **0 - Concierge spike (gating)** | Prove Claude + ONE Composio tool end-to-end through a custom Node `llmNode` override: tool-call marshalling, barge-in/interruption, and `abortSignal` actually cancelling an in-flight Composio call. Decides Node vs Python AND framework vs transport-only. | **~1 wk, blocks Phase 3** |
| **1 - Factor (ships on Vercel, no behavior change)** | Portable runner + queue wrapper + Redis rate limit + **voice key in schema** | ~3–4d |
| **2 - Worker tier** | Agent loop runs in Docker off Vercel; verify abort + no-gateway-fallback | ~3–5d |
| **3 - Voice MVP** | One Concierge speaks back one async result, **with durable completion** | ~5–7d **after** Phase 0 |
| **4 - Safety & confirm** | Side-effect gating, injection backstop, **cost caps** | ~4–6d |
| **5 - Scale & ops** | Autoscale, full obs, runbook | ~1–2 wk |

**Phases 1–2 deliver standalone value to the existing text product** (kill the `after()` ceiling, fix single-node rate limiting) and are worth shipping even if voice is deferred. **The runbook is a Phase-3 deliverable, not a Phase-5 afterthought.** If no one on a 1–3 person team will own that runbook, that is the signal to defer voice and keep shipping Phases 1–2.

---

## 8. Open Decisions + Simplest-Thing-That-Could-Work Fallback

### Open decisions for the product owner
1. **Concierge language - Node vs Python - decided by Phase 0 spike.** There is no Node Anthropic plugin, so you re-implement the LLM/tool bridge either way. Lean Node (single-language, reuse loop logic); fall back to Python (mature Anthropic plugin, second language, re-implement loop) if the `llmNode` bridge proves painful.
2. **STT/TTS plugin coverage.** Confirm the **Node** plugin set covers the chosen voice vendor (and VAD/endpointing config) *before* locking the language in.
3. **KMS choice for KEK custody**, and whether per-user DEKs land in Phase 1 or Phase 5.
4. **Self-host LiveKit trigger.** Stay on Cloud; pre-agree the revisit threshold (~100 concurrent / ~150k agent-min).
5. **Async-worker split to Cloud Run** for scale-to-zero savings later - only the *short* async jobs, never the persistent Concierge (60-min WS cap).

### Vendor lock-in caveat
"OSS server keeps migration a URL change" is true for the **SFU transport only**. The **Agents-framework layer** (`AgentSession`, the `llmNode` bridge) is LiveKit-specific and does **not** port to another media vendor by changing a URL.

### Simplest thing that could work (honest fallback)
> **LiveKit as transport only - reuse your existing loop.** The browser uses LiveKit purely as a WebRTC audio/data transport. STT runs on the worker; the reply is generated by your **existing server-side `agent-runner` loop** (no `ToolLoopAgent`→`ChatChunk` bridge, no LiveKit Agents framework); TTS streams back over a LiveKit audio/data track. This **cuts the framework lock-in and eliminates the `llmNode`-bridge risk** (the single biggest unestimated piece), and it genuinely reuses `agent-runner` where the full Agents framework does not. The cost: you build your own VAD / endpointing / barge-in.

The decision between "LiveKit Agents framework" and "LiveKit transport-only + reuse our loop" is the real fork, and **the Phase 0 spike should evaluate both.**

**Recommendation:** Greenlight Phases 1–2 now (low risk, standalone value). Greenlight Phase 0 (the spike) as a funded 1-week research task. Treat Phases 3–5 as contingent on the spike's outcome, not as a pre-committed estimate.

---

## Review findings & pre-enable gates (added 2026-06-20)

The worker tier (Phases 1–2: rate limiter, agent-runner, BullMQ job-queue, cron
wiring) passed an adversarial review - 51 candidate findings → 16 confirmed,
**zero critical/high on the live path**. With `WORKER_QUEUE_ENABLED` unset, the
diff is **byte-for-byte prod-safe** (verified): nothing enqueues, no Redis
socket opens, and cron runs inline exactly as before. Nothing must change before
merging.

These are gates to clear **before flipping `WORKER_QUEUE_ENABLED="true"` /
deploying the worker** (none block the current state):

1. **Re-run idempotency (MEDIUM).** With `attempts: 1`, a worker that crashes
   mid-run can have its job re-queued by BullMQ's stalled-job recovery, which
   could duplicate partially-persisted `onFinish` state (message row / memory
   flush) until Phase 4 idempotency lands. Before enabling: shorten the
   stalled/visibility window and/or fence re-runs with a Postgres advisory lock
   on the logical job.
2. **Stale-lock crash window (MEDIUM).** If a worker crashes after dequeue but
   before `releaseJobLocks`, a cron job stays locked until the ~10-min
   stale-lock reclaim. Add alerting on jobs locked > 5 min.
3. **Queue shutdown hook (LOW).** The Vercel app's cached BullMQ producer
   connection (only opened when the flag is on) is never closed - add a
   graceful-shutdown hook to avoid connection accumulation.

And a gate **before any Phase 3 user-facing enqueue** (web/voice):

4. **Instance-ownership check (HIGH).** `enqueueAgentJob` trusts its payload;
   the worker does not re-verify that `userId` owns `instanceId`. Any
   user-facing enqueue MUST assert ownership first (as the chat route does).
   Not exploitable today - the only enqueuer is the CRON_SECRET-gated cron
   dispatch.

## Relevant files (all absolute)
- `src/server/api/routers/trustclaw/agent/setup.ts` - `prepareAgentRun`, the portable seam
- `src/app/api/chat/route.ts` - the `after()` / server-controller pattern to relocate; rate-limit map; resumable SSE
- `src/server/clients/redis.ts` - pub/sub helpers already present
- `src/server/clients/crypto.ts` - AES-256-GCM to extend to all three key types
- `src/server/clients/{db,composio,mcp}.ts`, `agent/resolve-model.ts` - portable verbatim (confirm no silent gateway fallback for voice)
- `prisma/schema.prisma` - **add `voiceApiKey`/`voiceProvider`; currently only `composioApiKey`, `anthropicApiKey`, `CustomModel.providerApiKey`**
- `src/env.*` - add `LIVEKIT_*`, worker-auth signing secret
- **New:** `src/server/workers/agent-runner.ts`, `src/server/clients/job-queue.ts`, `src/workers/agent/index.ts`, `src/workers/agent/tools/policy.ts`, `src/workers/concierge/index.ts`, `src/app/api/voice/token/route.ts`, `Dockerfile.worker`, `fly.worker.toml`, `docker-compose.yml`
