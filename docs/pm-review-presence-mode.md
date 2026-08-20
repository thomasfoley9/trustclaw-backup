# PM review: Presence Mode proposal

From the Cowork PM session, August 20, 2026. Paste this into the Fable build session alongside PRD v1.2 (`docs/ea-prd.md`, which supersedes v1.1). Verdict: aligned, build it. The framing is right and two additions are real improvements we adopt. Apply the amendments below to the Presence Mode build doc and the slice plan before starting slice 1.

## Endorsed as-is

- Presence framing: headless EA, channels as doors, the app as control plane and flight recorder.
- Read-only channel transcripts in the app. Correct call; it prevents forked conversations. If reply-from-app is ever built, the reply routes back out through the channel.
- The kill switch. We missed it in v1.1; an always-on system needs a master mute from day one. Adopted, with one addition below.
- The sent-message loop guard on Slack-as-Thomas. Required. Fingerprint agent-authored messages in EaEvent, the same table that dedupes inbound.
- Reusing the existing two-agent LiveKit voice split for telephony, and sequencing phone last. The three reality checks (shared Twilio account, lk CLI deploy handoff, one-time console wiring) are honest and correct.

## Amendments (contractual, not suggestions)

1. Slice 1 acceptance includes the proactive engine explicitly: the 7am brief cron, the chase sweep riding the existing 10-minute sweeper, and the pre-call lookahead stub. Doors without the engine are a chatbot with more phone numbers; slice 1 is not done until the machine chases on its own.
2. The leash ships with the doors. Slice 1 hands the agent a Slack user token that can post anywhere as Thomas, plus an SMS sender. The minimal policy wrapper cannot wait for slice 3: a coded destination allowlist (posts to #ea by channel id, SMS to Thomas's number only, Gmail draft creation only; no Gmail send, no calendar invites, no posts elsewhere), with every send-class attempt intercepted into a draft plus an approval task. It is about a day of work and it is the difference between safe by design and safe so far.
3. Caps are global across channels, never per-channel: at most 5 standalone pings per day summed across Slack, SMS, and phone; at most 1 unrequested call per day; one quiet-hours clock (9:00pm to 6:30am PT) covering every channel, with explicitly scheduled calls exempt; one ladder state per task. Per-channel budgets would rebuild the car alarm this design exists to prevent.
4. Kill switch semantics: off means zero proactive outreach anywhere, and re-enabling must not backfire a flood; missed nudges fold into the next brief. Ladder timers pause, they do not accumulate sends.
5. send-ready is now defined (PRD section 6): it sends the referenced Gmail draft verbatim, one message per approval, confirmed with a link. Draft edits belong to Thomas and go as edited. Per-message approval is not Layer 4; Layer 4 remains sending without asking, promoted per action type only.
6. The channel question in your open-decisions list is closed: dedicated #ea channel, locked in the decision log this morning. Self-DM stays closed unless Thomas reopens it. Give agent-authored messages a stable text prefix so his eye and the parser both separate the two voices sharing one Slack identity.
7. SMS is a dark launch: build the webhook and outbound client in slice 1, but slice acceptance is independent of carrier approval. A2P registration goes in under the company EIN as a standard brand, not sole proprietor, submitted the day the Twilio account exists.
8. Phone guardrails: unknown callers reach a voicemail persona with zero tools and zero account data; outbound respects quiet hours except explicit "call me at X" instructions. Caller ID is spoofable, which is acceptable while phone-originated actions ride the same policy layer; if higher-risk actions are ever promoted, add a spoken passphrase for phone-originated approvals.
9. Makeover phasing: Approvals inbox first (slice 2, it is the UI face of the leash), then Today and the Tasks view, then the Watchboard; command palette, PWA pass, and the presence dot are a polish pass. UI trails backend and never blocks it. Your own observation that every screen is a projection of slice 1 and 2 data is the proof the design is right; keep it that way.
10. The standing ground rules from `docs/ea-build-brief.md` still bind: additive migrations only, no new always-on polling beyond the existing sweeper, all 203 existing tests green with new coverage per work package, no deploys, no touching SalesClaw, and no em dashes or AI slop in anything user-facing.

## Your open decisions, answered

- Self-DM vs solo channel: closed, #ea dedicated channel.
- send-ready semantics: defined in amendment 5 and PRD section 6.
- Brief delivery split: the full brief lives in #ea only; every other channel carries escalations and on-demand answers, never scheduled content.
- SalesClaw retirement: 3-to-5-day parallel run once the EA brief ships, then Thomas retires it explicitly. The build never touches it.

## Doc hygiene

Fold the three-table data model and the reply grammar from `docs/ea-build-brief.md` into the Presence doc so the two documents cannot fork, and treat PRD v1.2 as the behavior source of truth. Where the Presence doc and the PRD disagree after these amendments, flag it rather than picking silently.
