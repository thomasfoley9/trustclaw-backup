# Thomasclaw Presence Mode (the EA): PRD v1.2

Status: v1.2, amended after PM review of Fable's Presence Mode proposal
Date: August 20, 2026
Product owner: Thomas
PM and spec: Claude (Cowork), read-only toward the codebase and production systems
Build: Fable / Claude Code on Thomas's Mac, working in thomasclaw-src
Supersedes: PRD v1.1 (thomasclaw-ea-prd-v1.md)
Companions: `docs/ea-build-brief.md` (Phase 1 mechanics) and Fable's Presence Mode build doc (wireframes, UI, slices). On behavior, this PRD wins; on codebase mechanics, the code wins; on UI detail, the Presence doc wins.

## 1. What we are building

Thomasclaw goes headless. Product name: Presence Mode. One switch that says the EA exists out in the world as a reachable entity, with the places Thomas already lives as the doors: the #ea Slack channel, SMS, the phone (in and out), and web chat. The web app stops being the front door and becomes the control plane and the flight recorder: Channels config, the task ledger, and read-only transcripts of every headless conversation.

Behind the doors, one EA. It watches email, calendar, Slack, Fireflies, and Salesforce, keeps a durable ledger of tasks and promises, and chases both sides of every deal: counterparties who owe Thomas a reply, and Thomas when he owes one. It arrives with the work already done (draft written, brief built, SFDC update staged), reports once a day at 7:00am PT, and never sends anything external without per-message approval until a specific action type is explicitly promoted.

One sentence: a chief of staff that chases with finished work in hand, reachable from anywhere, with the app as the record.

## 2. Problem

Thomas is elite at selling and allergic to admin. Deals leak in the follow-through layer: threads go quiet, promises slip, calls happen unprepped, SFDC goes stale. Existing tools either wait to be driven or nag without helping. The EA inverts it: the system drives, Thomas approves.

## 3. Product principles (the anti-brittle contract)

1. One brain, many doors, one attention budget. Memory, ledger, and state hang off the instance, so the EA that nudged by SMS is the same one that answers the phone. The #ea channel is the command center; other channels carry escalations and on-demand asks. All caps are global across channels, never per-channel.
2. Chase with the work done. Every nudge ships with its deliverable attached: the reply in Gmail drafts, the brief linked, the SFDC update staged. Chasing someone to do work is nagging. Chasing someone to approve finished work is leverage.
3. The leash ships with the doors. From slice 1, a coded destination allowlist governs everything outbound: posts to #ea by channel id, SMS to Thomas's number, Gmail draft creation, and nothing else. Any send-class attempt is intercepted into a draft plus an approval task. Enforced in code, never only in the prompt.
4. Silence is data. An unacknowledged nudge climbs the ladder (Slack, brief, sharper Slack, SMS, phone); it never repeats on the same rung. Hard caps, quiet hours, snoozes always honored.
5. Fail quiet. Nothing useful means one line or nothing. No manufactured busywork.
6. Idempotent everything, including the EA's own voice. Every inbound event and sweep dedupes through the event log, and messages the EA posts as Thomas are fingerprinted (loop guard) so it can never trigger itself. Agent-authored messages carry a stable prefix so his eye and the parser both separate the voices.
7. The app never competes with the channels. Transcripts in the control plane are read-only. If reply-from-the-app is ever built, the reply routes back out through the channel itself so the conversation never forks.

## 4. Capabilities

**Dropped Ball Detector.** Watches both directions across all external mail, deal threads, and customers. Chase window: 1 business day of thread silence. "They owe me" produces a drafted nudge to them; "I owe them" produces a nudge to Thomas with the drafted reply attached.

**Promise tracker.** Commitments extracted from calls and email become tasks with deadlines measured in hours, not days. Default: surfaced within 4 working hours, draft attached.

**Pre-call briefs.** One page, every external meeting, ready at least 2 hours ahead. Sources: Fireflies history, Gmail, Slack, calendar, SFDC, deep research on the person and company, PostHog signal for attendees and their domain, and a Composio fit thesis. Interviews get interview-tailored prep. Output is a Google Doc linked from the nudge and the daily brief.

**Post-call pipeline.** A Fireflies transcript landing triggers: extract next steps, create tasks, update the SFDC opportunity (next step, activity, stage notes), draft the follow-up into Gmail drafts, post the package to #ea for approval.

**Task ledger.** Every task gets a short stable ID (T-14). Born from calls, emails, promises, meeting prep, or Thomas saying so. "What's due" is answerable from any door. States: open, waiting, done, snoozed.

**Daily brief.** 7:00am PT, full brief in #ea only. Other channels never carry scheduled content, only escalations and on-demand answers; that is what keeps five doors from becoming five alarms. Sections: needs-you-today, dropped balls with rung markers, promises due, drafts ready to approve, today's calls with brief links. Replaces SalesClaw (cutover in section 11).

**The doors.**

- Slack (#ea): command center. Nudges, briefs, approvals, and anything Thomas types, parsed as commands or natural language.
- SMS: chase rung 4, approvals, and quick asks from anywhere. Ships dark in slice 1; goes live when A2P clears.
- Phone, inbound: Thomas dials the Twilio number, the existing LiveKit voice agent answers with full tool access, gated by caller ID. Unknown callers reach a voicemail persona with zero tools and zero account data.
- Phone, outbound: ladder rung 5 and a scheduling primitive ("call me at 6:45 with the brief"). Max 1 unrequested call per day; requested calls are exempt.
- Web chat: still there, now one door among several, backed by the control plane.

**Kill switch.** A master toggle on the Channels page that silences all proactive outreach across every channel, day one, plus per-channel toggles. On re-enable there is no backfire flood: missed nudges fold into the next brief instead of firing in a burst.

**Summon anywhere.** Reply in #ea, text it, call it, or open the app. Telegram stays as a door. Every door opens into the same state.

## 5. System design (how it lands in Thomasclaw)

Data model, additive migrations, auto-run on deploy:

- `EaTask`: title, status, dueAt, priority, source, sourceRef, lastNudgedAt, nudgeCount, escalationRung, ackedAt, snoozedUntil, short public ID from a sequence.
- `EaWatch`: one row per tracked thread or person. direction, lastActivityAt, chaseAfter, lastNudgedAt, state.
- `EaEvent`: inbound event log with unique dedup fingerprints (Gmail message id, Fireflies transcript id, Slack ts, Twilio message sid, call sid). Also records the EA's own outbound messages for the loop guard.

Engine:

- `ea_task` agent tool (create, complete, snooze, list) registered on every surface.
- `slack.ts` outbound through the Composio Slack user connection; `sms.ts` outbound plus a Twilio inbound webhook (shipped dark until A2P clears); both beside `telegram.ts`.
- Seeded system crons: 7am brief (an agent run; it composes prose), chase sweep riding the existing 10-minute sweeper, pre-call lookahead with a 2-hour horizon. The sweep and lookahead are deterministic code, never an LLM run per tick: caps and ladder state are never subject to model judgment, and a tick with nothing due makes zero LLM calls. The sweep includes a bounded Gmail delta scan (stored cursor) that maintains EaWatch in slice 1; the slice 2 Gmail trigger retires that scan. No new always-on polling, ever; real-time comes from triggers in slice 2. Neon compute stays flat.
- Inbound day one: sweeper reads #ea since a stored cursor; slice 2 moves this to the `/api/triggers/composio` endpoint (signature-verified, EaEvent dedup, dispatch via the cron executor pattern) alongside Gmail, Calendar, and Fireflies triggers.
- Policy layer, slice 1 minimal form: the destination allowlist from principle 3, wrapping the Composio toolset before the agent sees it. Slice 3 formalizes it into a policy table with the per-action-type allowlist column that is the Layer 4 lever.
- Control plane: every channel lands as a dedicated conversation (the `dedicatedConversationTitle` pattern) with a source badge (web, telegram, cron, sms, slack, voice), rendered read-only in the UI.
- Telephony (slice 3): Twilio SIP trunk into LiveKit; inbound drops the call into a room where the existing two-agent voice split picks up (speaking front on OpenAI Realtime, delegate with full tools); outbound dials via SIP participant. The voice agent deploys through the `lk` CLI on Thomas's side with a written runbook; the web-side code ships through the normal Vercel path.

## 6. The nudge ladder

- Rung 0: task created, appears in the next brief.
- Rung 1: one standalone #ea message, work attached.
- Rung 2: folded into the next brief, marked "2nd ask".
- Rung 3: a sharper standalone #ea ping the next morning.
- Rung 4: SMS (once A2P clears; until then rung 3 is the ceiling).
- Rung 5: a phone call, reserved for items that blew through everything and genuinely cannot wait.

Guarantees, enforced in code: at most 5 standalone pings per day, summed across every channel, overflow batching into briefs; at most 1 unrequested call per day; quiet hours 9:00pm to 6:30am PT on every channel, phone included, with explicitly scheduled calls ("call me at X") exempt; one message per task per rung; a snooze always wins; an ack means silence; kill switch on means zero outreach, and re-enabling folds missed items into the next brief.

Reply grammar, honored on any verified-Thomas door: `done`, `snooze til X`, `kill`, `draft it`, `what's due`, `send-ready`. Anything unparseable goes to the full agent as natural language.

**send-ready semantics (the trust hinge).** `send-ready T-14` sends the referenced Gmail draft verbatim and confirms with a link to the sent message. If the draft changed since the nudge, whatever is in the draft is what goes (Thomas's edits are Thomas's words). Each approval covers exactly one message; there is no standing approval. Per-message approval is not Layer 4. Layer 4 remains sending without asking, unlocked per action type only after weeks of unedited approvals.

**Stale-draft guard (added at build kickoff review).** If the thread has inbound activity newer than the draft (the counterparty replied after the draft was written), send-ready does not send. It warns with what changed and offers a refreshed draft. A verbatim send of a pre-reply draft is the trust-costing failure this guard exists to prevent.

## 7. Slices and acceptance criteria

**Slice 1, the spine and the text doors.** Migrations; `ea_task` tool; `slack.ts` and the #ea channel; seeded crons (7am brief, chase sweep, pre-call lookahead stub); inbound #ea polling with the reply grammar; ladder and caps in code; Channels page with kill switch and per-channel toggles; SMS webhook and outbound client shipped dark; destination allowlist; loop guard.
Done when: the 7am brief lands in #ea; "what's due" works from web, Telegram, and #ea; a dropped ball produces exactly one rung-1 nudge with a Gmail draft attached and never a duplicate; flipping the kill switch makes a forced sweep produce zero outreach; a send-class attempt (Gmail send, Slack post outside #ea) is intercepted into an approval task; SMS round-trips against a test number; the test suite is green (203 existing plus new coverage). A2P campaign approval is explicitly not a gate for slice 1.

**Slice 2, the ears and the pipelines.** `/api/triggers/composio`; Gmail, Calendar, Fireflies, and #ea Slack triggers registered through Composio (retiring the polling path); pre-call brief pipeline; post-call pipeline with the SFDC field allowlist (next step, activity, stage notes, no deletes, every write logged with its source transcript link); Approvals inbox in the control plane.
Done when: an inbound reply clears its watch within about a minute; every external call has a brief at least 2 hours ahead; within 30 minutes of a transcript landing there are tasks, an SFDC update, and a follow-up draft; the Approvals inbox lists exactly the pending approval tasks.

**Slice 3, telephony and the formal leash.** SIP trunk runbook and console wiring; inbound calls routed into the existing voice agent, caller-ID gated; outbound calling as rung 5 plus the "call me at X with Y" verb; policy table formalizing the allowlist with the per-action-type column.
Done when: Thomas calls the number from his cell and gets the full assistant mid-call doing real work; an unknown number gets voicemail and nothing else; a scheduled "call me at 6:45 with the brief" fires on time; every blocked or approved action has an audit row.

**Layer 4, graduation.** Per-action auto-send allowlist, twice-daily activity brief, out-of-norm pings. Entry condition: weeks of rung-1 drafts for that action type approved without edits.

## 8. Success metrics

- Response debt: median age of I-owe-them threads, target under 1 business day.
- Nudge efficacy: share of rung-1 nudges acted on within 24 hours, target above 60 percent.
- Prep coverage: external calls with a brief 2 hours ahead, target 100 percent.
- Noise ceiling: standalone pings per day at or under 5 across all channels; kill-plus-snooze rate under 30 percent.
- Safety: outbound sends without a per-message approval, exactly zero, forever. Outreach while the kill switch is on, exactly zero.
- Trust ramp: time to the first Layer 4 promotion.

## 9. Risks and mitigations

- Slack user token blast radius (the agent can post anywhere as Thomas): the slice 1 destination allowlist confines it to #ea by channel id; everything else intercepts.
- Notification fatigue across five doors: global caps, the full brief confined to #ea, fail-quiet, weekly threshold tuning. Under pressure the rule is cut, never add.
- A2P registration is carrier-gated and takes days to weeks: register day one under the company EIN as a standard brand, not sole proprietor; SMS ships dark and lights up on approval; nothing else waits on it.
- Caller ID is spoofable: acceptable today because phone-originated actions still ride the same policy layer (drafts and reads, sends only via per-message approval). If higher-risk actions are ever promoted, add a spoken passphrase for phone-originated approvals.
- Webhook replays cause double actions: EaEvent fingerprints, idempotent writes, dedup covered by tests.
- Bad SFDC writes: field allowlist, source links, no deletes ever.
- Database cost creep: trigger-first, sweeper cadence unchanged, Neon compute watched weekly.
- Voice agent deploy needs interactive auth: known handoff; runbook plus a 10-minute Thomas-side deploy when slice 3 touches the voice agent.

## 10. Out of scope for v1

Sending without per-message approval (until a Layer 4 promotion), reply-from-the-app (transcripts stay read-only), multi-user support, anything beyond voicemail for unknown callers, and inbound SMS from anyone but Thomas.

## 11. Decision log

Locked August 20, morning:

- Chase window 1 day for threads; promises in hours.
- Scope: all email, all deal threads, all customers.
- Daily brief 7:00am PT; replaces SalesClaw. Cutover recommendation: 3-to-5-day parallel run once the EA brief ships, then Thomas retires SalesClaw explicitly. Nothing in this build touches SalesClaw.
- Drafts always pre-written. Style: concise, friendly, no em dashes, no AI slop.
- Command channel: a new dedicated #ea Slack channel (re-affirmed at PM review; self-DM is closed unless Thomas reopens it).
- Triggers for events, sweeper for time, daily cron for the brief. No brute-force polling.
- Delivery model: Cowork session is PM and spec, read-only; Fable / Claude Code builds.

Added August 20, PM review of the Presence Mode proposal:

- Presence Mode framing adopted: headless EA, app as control plane and flight recorder.
- Channel transcripts in the app are read-only.
- Kill switch ships day one, with the no-backfire re-enable rule.
- SMS pulled forward into slice 1 as a dark launch; A2P approval gates go-live, not the build.
- Phone lands in slice 3: inbound caller-ID gated, outbound as rung 5, max 1 unrequested call per day.
- All caps global across channels.
- send-ready defined as per-message approval of one Gmail draft, verbatim; not Layer 4.
- The minimal policy allowlist moves up into slice 1: the leash ships with the doors.
- UI makeover phased, UI trails backend: Approvals inbox first, then Today and Tasks, then Watchboard; command palette, PWA pass, and the presence dot are a polish pass.

Added August 20, build kickoff review (Fable, with codebase access):

- Chase sweep and pre-call lookahead are deterministic code; LLM calls happen only when content needs writing. A quiet tick costs zero tokens.
- EaWatch gets a slice 1 population path: a bounded Gmail delta scan inside the sweep, retired by the slice 2 trigger.
- send-ready gains the stale-draft guard (section 6).
- EA system runs pin to the funded Anthropic key model; house models fail closed on owner balance and must not carry scheduled runs.
- WP0 pre-flight added: audit the instance's Composio tenant connections (Gmail, Calendar, Slack scopes, Fireflies, SFDC) before any code.
- Repo baseline established: thomasclaw-src was not a git repo (recovered tree); now git-initialized, main = prod baseline, work on ea-phase-1.
- Presence defaults to off per instance (multi-user codebase).
- Migration validation path acknowledged: no local database exists on the build Mac, so the first preview deploy (fail-closed migrate) is the real migration gate, and Thomas triggers it.

## 12. Open items

Nothing blocking. Tunables that settle during slices 1 and 2: the phone-call daily cap, whether SMS ever gets a 3-line brief variant (default no), and the exact agent-voice prefix in #ea.

## 13. UI makeover priority (control plane)

The app's job changes from where you talk to where you see. Every screen below is a projection of data slices 1 and 2 already produce, so UI work trails the backend and never blocks it.

1. Channels page with kill switch (slice 1, required).
2. Approvals inbox (slice 2): the UI face of the leash and the single highest-leverage new screen.
3. Today home screen and the Tasks ledger view (post-slice 2).
4. Watchboard: open loops across deals, a projection of EaWatch (post-slice 2).
5. Polish pass: transcript source badges and channel-grouped sidebar, command palette, PWA pass for the phone, presence dot in the navbar.
