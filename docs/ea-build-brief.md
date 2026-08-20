# Thomasclaw EA: Build Brief for Claude Code

Companion to `ea-prd.md`. The PRD is the what and the why; this is the how. Author: the Cowork PM session, August 20, 2026. Maintenance rule: changes to scope or invariants go through the PRD first, and this brief follows it.

Amendment note, August 20 PM review: PRD v1.2 (`docs/ea-prd.md`) supersedes v1.1 and folds in the Presence Mode framing. Slice 1 now also includes the SMS webhook and outbound client shipped dark, the Channels page with the master kill switch, and the coded destination allowlist. The full amendment list is in `docs/pm-review-presence-mode.md`; where this brief and PRD v1.2 disagree, the PRD wins.

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

### WP4: Seeded system crons

On EA enable, seed three system-owned jobs using the existing cron job model:

1. Daily brief at 7:00am America/Los_Angeles.
2. Chase sweep riding the existing 10-minute sweeper: walks `EaWatch` and `EaTask`, applies the ladder, respects caps, quiet hours, and snoozes. Every send updates lastNudgedAt, nudgeCount, and escalationRung in the same transaction as its `EaEvent` dedup row.
3. Pre-call lookahead with a 2-hour horizon. In Phase 1 it creates a prep task; Phase 2 wires the full brief pipeline into it.

Acceptance: jobs appear in the cron audit trail; a forced run produces exactly one nudge per eligible task; an immediate second run produces zero.

### WP5: Inbound polling and the reply grammar

A sweeper job reads #ea messages since a stored cursor. Replies from Thomas in a nudge thread parse as: `done`, `snooze til X`, `kill`, `draft it`, `what's due`. Anything unparseable is handed to the agent loop as a normal message in the EA conversation (the `dedicatedConversationTitle` pattern), so natural language always works as a fallback. Cursor advances are transactional with `EaEvent` rows so no message is ever processed twice.

Acceptance: parser unit tests including sloppy phrasing; a replay test proving idempotency.

### WP6: Ladder and caps in code

Escalation rungs 0 through 3 per PRD section 6, computed from task state, never inferred from message history. Caps and quiet hours are constants in one config module: max 5 standalone pings per day with overflow batching into briefs, quiet hours 9:00pm to 6:30am PT, one message per task per rung, snooze always wins, ack means silence.

Acceptance: tests proving never two messages for one task on the same rung, never more than 5 standalone pings across a simulated day, and quiet-hours sends deferred rather than dropped.

Phase 1 definition of done: PRD section 7, plus a dry run witnessed by Thomas: one morning brief and one real dropped-ball nudge with a Gmail draft attached.

## Phase 2 outline (do not start without Thomas's word)

- `/api/triggers/composio`: verify the signature, write an `EaEvent` with a dedup fingerprint, dispatch an agent run through the cron executor pattern (atomic claim, wall-clock abort, audit row). One endpoint for every trigger type.
- Register through Composio: Gmail new message, Calendar event created or updated, Fireflies transcript ready, and Slack messages in #ea (which retires the WP5 polling path).
- Post-call pipeline per the PRD. SFDC writes restricted to an allowlist: next step, activity, stage notes. No deletes, ever. Every write logs its source transcript link.
- Pre-call briefs generated as Google Docs and linked in #ea.

## Phase 3 outline

Policy table plus a tool wrapper that intercepts send-class Composio actions (Gmail send, Slack posts to anyone but Thomas, calendar invites) into a draft plus an approval task. Approval queue card in the dashboard. A per-action-type allowlist column is the Layer 4 lever.

## Phase 4 outline

Allowlist promotions one action type at a time, a twice-daily activity brief (what I did and why), out-of-norm pings, and the SMS rung once a Twilio connection exists in Composio.

## SalesClaw cutover (recommendation; decision pending)

Once the EA brief ships, run both for 3 to 5 days, then Thomas retires SalesClaw explicitly. Nothing in this build modifies SalesClaw.

## Kickoff prompt for Claude Code

```
Read CLAUDE.md, docs/ea-prd.md, docs/ea-build-brief.md, and docs/pm-review-presence-mode.md in full before doing anything.

Build Phase 1 of the EA exactly as specified: WP1 through WP6, in order. Rules that override anything else you infer: additive migrations only; no new polling loops beyond the existing 10-minute sweeper; draft-only outbound enforced in code; do not deploy; do not touch SalesClaw; keep all existing tests green and add coverage for every work package.

Work in a branch named ea-phase-1. After each work package, run the full test suite and commit. When WP6 passes, stop and produce a summary of changes, test results, and exactly what Thomas needs to do for the witnessed dry run.

If the codebase contradicts the brief on a mechanical detail, follow the codebase and note the deviation in your summary. If it contradicts the PRD on behavior, stop and ask.
```
