# Thomasclaw EA: Build Brief for Claude Code

Companion to `ea-prd.md`. The PRD is the what and the why; this is the how. Author: the Cowork PM session, August 20, 2026. Maintenance rule: changes to scope or invariants go through the PRD first, and this brief follows it.

Amendment note, August 20 PM review: PRD v1.2 (`docs/ea-prd.md`) supersedes v1.1 and folds in the Presence Mode framing. Slice 1 now also includes the SMS webhook and outbound client shipped dark, the Channels page with the master kill switch, and the coded destination allowlist. The full amendment list is in `docs/pm-review-presence-mode.md`; where this brief and PRD v1.2 disagree, the PRD wins.

Amendment note, August 20 build kickoff review (Fable): the WP list below now matches PRD v1.2 slice 1 (WP0 and WP7 through WP9 added; previously the kickoff prompt stopped at WP6 and would have shipped slice 1 without the kill switch, the allowlist, or SMS). Also locked here: the chase sweep is deterministic code, never an LLM run per tick; the sweep includes a watch builder so EaWatch has a Phase 1 population path; send-ready carries a stale-draft guard (PRD section 6); the repo now has a git baseline (`main` = recovered prod tree, work happens on `ea-phase-1`).

## How to use this document

1. Copy `ea-prd.md` and this file into `thomasclaw-src/docs/`.
2. Open Claude Code in `thomasclaw-src` and paste the kickoff prompt from the last section.
3. Build proceeds phase by phase. Phase 1 only, until Thomas says otherwise.

## Ground rules for the implementing agent

1. Read `CLAUDE.md`, `docs/ea-prd.md`, and this brief in full before writing code. Where this brief names files or patterns, verify against the actual codebase. On mechanics, the codebase wins; on behavior, the PRD wins.
2. Migrations are additive only. Never alter or drop existing columns or tables.
3. No new always-on polling loops. Time-based work rides the existing 10-minute sweeper. Real-time work waits for Phase 2 triggers. This is a cost constraint with history behind it (the Neon compute incident), not a style preference.
4. All 203 existing vitest tests stay green, and every work package ships with its own tests.
5. Draft-only outbound is enforced in code, never only in the prompt.
6. Style for everything user-facing (nudges, briefs, drafts): concise, friendly, no em dashes, no AI slop phrasing.
7. Do not deploy to production, and do not touch SalesClaw. Local build and test only; Thomas triggers deploys.

## Verified architecture anchors (from an August 20 read of the repo; re-verify before relying on them)

- Every surface funnels into `prepareAgentRun()` in `setup.ts`, which assembles the system prompt, loads conversation context through 3-layer compaction, and registers the tool groups: memory (pgvector, bucketed), scheduling (`schedule.ts`), and the Composio tool surface.
- Cron subsystem: a sweeper every 10 minutes plus QStash push scheduling, atomic DB claims with fencing tokens, per-run audit rows, auto-pause after 3 consecutive failures, delivery to Telegram when linked, and a `dedicatedConversationTitle` pattern that pins a job's output to a named conversation.
- The only inbound webhook today is Telegram.
- Deploys run from Thomas's Mac via `vercel deploy`; migrations auto-run on deploy.

## Phase 1 work packages

### WP0: Pre-flight audit (no code)

Confirm, inside the Thomasclaw instance's Composio tenant (not any other workspace), that these connections exist and are healthy: Gmail, Google Calendar, Slack (user token with write scope; confirm whether private-channel creation is in scope, else Thomas creates #ea by hand once and setup stores the id), Fireflies, Salesforce. Confirm the instance's model for EA runs is a funded one (house models fail closed when the owner balance is empty; pin EA system runs to the Anthropic key model). Record findings at the top of the build summary.

### WP1: Data model

Three new tables, named and cased per the existing schema conventions:

- `EaTask`: title, status (open, waiting, done, snoozed), dueAt, priority, source (call, email, promise, prep, manual), sourceRef (Fireflies id, Gmail thread id, SFDC opp id), lastNudgedAt, nudgeCount, escalationRung, ackedAt, snoozedUntil, plus a short stable public ID (T-14) issued from a sequence.
- `EaWatch`: one row per tracked thread or person. direction (they-owe or I-owe), lastActivityAt, chaseAfter, lastNudgedAt, state.
- `EaEvent`: inbound event log with a unique dedup fingerprint (Gmail message id, Fireflies transcript id, Slack ts). The idempotency keystone; nudges and inbound processing both write here.

Acceptance: the migration runs clean on a fresh database and on the current schema; models are registered wherever the ORM expects them.

### WP2: `ea_task` agent tool

Mirror the registration pattern of `schedule.ts`. Operations: create, complete, snooze (until a timestamp), list (filters: due, open, waiting, snoozed, all). Public IDs come from a sequence, never from parsing existing titles. The tool registers on every surface so "what's due" works from web, Telegram, and Slack.

Acceptance: each operation unit-tested; ID stability tested; "what's due" returns a correctly filtered ledger.

### WP3: Slack outbound client and the #ea channel

`slack.ts` beside `telegram.ts`, calling through the existing Composio Slack user connection (posts as Thomas). The EA channel is referenced by stored channel id, not by name; a first-run setup step creates the private #ea channel if missing, resolves its id, and stores it. Message shapes: nudge (task ID, one-line ask, link to the attached work), daily brief (sections per PRD section 4), and one-line acks.

Acceptance: a test-mode post lands in #ea; snapshot tests for each message shape.

### WP4: Seeded system crons and the sweep engine

On EA enable, seed the daily brief (7:00am America/Los_Angeles) as a system-owned job on the existing cron job model. The chase sweep and pre-call lookahead are NOT agent-prompt cron jobs: they are deterministic code invoked from the sweeper path, because an LLM run every 10 minutes is 144 invocations a day of cost, and the anti-nag caps must never depend on model judgment. The model is only called when content needs writing (a draft, a brief).

1. Daily brief at 7:00am America/Los_Angeles (agent run; it composes prose).
2. Chase sweep, deterministic code riding the existing 10-minute sweeper: walks `EaWatch` and `EaTask`, applies the ladder, respects caps, quiet hours, and snoozes. Every send updates lastNudgedAt, nudgeCount, and escalationRung in the same transaction as its `EaEvent` dedup row. Includes the watch builder: a bounded Gmail delta scan since a stored cursor that upserts `EaWatch` lastActivityAt and creates watches for external threads (this is the Phase 1 population path for EaWatch; the slice 2 Gmail trigger retires it). Draft generation for a nudge is a scoped agent call made only when a nudge is actually due.
3. Pre-call lookahead with a 2-hour horizon, deterministic scan of the calendar. In Phase 1 it creates a prep task; Phase 2 wires the full brief pipeline into it.

Acceptance: runs appear in the audit trail; a forced run produces exactly one nudge per eligible task; an immediate second run produces zero; a sweep tick with nothing due makes zero LLM calls.

### WP5: Inbound polling and the reply grammar

A sweeper job reads #ea messages since a stored cursor. Replies from Thomas in a nudge thread parse as: `done`, `snooze til X`, `kill`, `draft it`, `what's due`. Anything unparseable is handed to the agent loop as a normal message in the EA conversation (the `dedicatedConversationTitle` pattern), so natural language always works as a fallback. Cursor advances are transactional with `EaEvent` rows so no message is ever processed twice.

Acceptance: parser unit tests including sloppy phrasing; a replay test proving idempotency.

### WP6: Ladder and caps in code

Escalation rungs 0 through 3 per PRD section 6, computed from task state, never inferred from message history. Caps and quiet hours are constants in one config module: max 5 standalone pings per day with overflow batching into briefs, quiet hours 9:00pm to 6:30am PT, one message per task per rung, snooze always wins, ack means silence.

Acceptance: tests proving never two messages for one task on the same rung, never more than 5 standalone pings across a simulated day, and quiet-hours sends deferred rather than dropped.

### WP7: Destination allowlist (the slice 1 leash)

A coded wrapper around the Composio toolset before the agent sees it. Allowed destinations: posts to #ea by stored channel id, SMS to Thomas's verified number, Gmail draft creation, and reads everywhere. Everything send-class (Gmail send, Slack posts anywhere else, calendar invites) intercepts into a draft plus an approval `EaTask`. send-ready carries the stale-draft guard per PRD section 6: if the thread has inbound activity newer than the draft, warn and offer a refreshed draft instead of sending.

Acceptance: a Gmail send attempt produces a draft and an approval task, not a send; a Slack post to any channel but #ea is blocked with an audit row; send-ready on a stale draft warns instead of sending; send-ready on a fresh draft sends exactly once and confirms with a link.

### WP8: Channels page, kill switch, per-channel toggles

New dashboard page per the Presence doc WF-1. Master `presenceEnabled` toggle (off means zero proactive outreach anywhere; re-enable folds missed nudges into the next brief, never a backfire burst; ladder timers pause, they do not accumulate). Per-channel toggles for Slack and SMS. Quiet hours, ping cap, and chase window shown read-only from the config module in Phase 1. Presence defaults to OFF for every instance; this is a multi-user codebase.

Acceptance: kill switch off plus a forced sweep produces zero outreach; re-enable after a simulated missed day produces zero standalone pings and one brief containing the backlog.

### WP9: SMS dark launch

`twilio.ts` beside `telegram.ts` (direct REST, no Composio dependency); `/api/twilio-webhook` with signature verification and a verified-sender gate; number verification flow on the Channels page (6-digit code, same token pattern as Telegram linking); `sms` added to `MessageSource`. Ships dark: fully built and tested behind the channel toggle, goes live when A2P clears. Inbound SMS from anyone but the verified number is dropped and logged.

Acceptance: webhook signature and sender-gate tests; a mocked round-trip (inbound command, ledger effect, outbound reply); rung 4 stays unreachable while the channel toggle is off.

Phase 1 definition of done: PRD section 7, plus a dry run witnessed by Thomas: one morning brief and one real dropped-ball nudge with a Gmail draft attached.

## Phase 2 outline (do not start without Thomas's word)

- `/api/triggers/composio`: verify the signature, write an `EaEvent` with a dedup fingerprint, dispatch an agent run through the cron executor pattern (atomic claim, wall-clock abort, audit row). One endpoint for every trigger type.
- Register through Composio: Gmail new message, Calendar event created or updated, Fireflies transcript ready, and Slack messages in #ea (which retires the WP5 polling path).
- Post-call pipeline per the PRD. SFDC writes restricted to an allowlist: next step, activity, stage notes. No deletes, ever. Every write logs its source transcript link.
- Pre-call briefs generated as Google Docs and linked in #ea.

## Phase 3 outline

Policy table plus a tool wrapper that intercepts send-class Composio actions (Gmail send, Slack posts to anyone but Thomas, calendar invites) into a draft plus an approval task. Approval queue card in the dashboard. A per-action-type allowlist column is the Layer 4 lever.

## Phase 4 outline

Allowlist promotions one action type at a time, a twice-daily activity brief (what I did and why), and out-of-norm pings. (SMS builds in WP9 as a dark launch; it goes live on A2P approval, not in this phase.)

## SalesClaw cutover (recommendation; decision pending)

Once the EA brief ships, run both for 3 to 5 days, then Thomas retires SalesClaw explicitly. Nothing in this build modifies SalesClaw.

## Kickoff prompt for Claude Code

```
Read CLAUDE.md, docs/ea-prd.md, docs/ea-build-brief.md, and docs/pm-review-presence-mode.md in full before doing anything.

Build Phase 1 of the EA exactly as specified: WP0 through WP9, in order. Rules that override anything else you infer: additive migrations only; no new polling loops beyond the existing 10-minute sweeper; the chase sweep is deterministic code, never an LLM run per tick; draft-only outbound enforced in code; do not deploy; do not touch SalesClaw; keep all existing tests green and add coverage for every work package.

The repo already has a git baseline: main is the recovered prod tree, and the working branch ea-phase-1 exists. Work there. After each work package, run the full test suite and commit. When WP9 passes, stop and produce a summary of changes, test results, and exactly what Thomas needs to do for the witnessed dry run.

If the codebase contradicts the brief on a mechanical detail, follow the codebase and note the deviation in your summary. If it contradicts the PRD on behavior, stop and ask.
```
