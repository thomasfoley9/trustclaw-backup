# Overnight log

## Blocker found at start: no push access

The GitHub account on this machine (`thomasfoley9`) has pull-only permission on `ComposioHQ/trustclaw` (`push: false`), and there is no SSH key. Creating a fork was also blocked by the session's permission policy. So the ten PRs exist as **local stacked branches** (`fable/01-*` through `fable/10-*`), each individually mergeable, with a ready-to-post PR description in `.fable/NN-slug.md` and a `.fable/open-prs.sh` script that pushes every branch and opens the stacked PRs the moment someone with write access runs it.

The base for the stack is the local branch `feat/sales-tool-customizations` (dff9182), which is 152 commits ahead of `origin/main` and was never pushed. Note: `origin/main` has 4 commits not in this branch; someone should reconcile that eventually.

## Shipped

- PR 01 `fable/01-brand-copy-integrity`: checks green (typecheck + lint).
- PR 02 `fable/02-chat-correctness`: checks green. All six P0s plus regenerate/retry, type-ahead, drafts, markdown, timestamps/tokens, derived prompts. One dependency added: rehype-highlight.
- PR 03 `fable/03-activation-path`: checks green. Gate deleted, forgot-password dead end removed, deep links, session-expiry redirect, onboarding save errors, honest counter, encryption copy on six surfaces, server-driven OAuth refusal, register-tab CTAs, non-destructive Re-run setup (schema migration included).
- PR 04 `fable/04-settings-integrity`: checks green. Error-vs-empty fixed across the settings surface, delete confirms, timezone UI (no migration needed: the column already existed), toolkits.disconnect (Composio SDK supported it), upstream custom-model key validation, cron-format fork deleted, RHF migration for six forms, popup connect flow, honest danger zone.
- PR 05 `fable/05-design-system`: checks green. Motion tokens + full transition sweep (40 files), zero hover:scale, one purple, AA gradient contrast (computed), text-2xs ramp, Spinner/EmptyState/10 skeletons, focus parity, elevated/glass depth, brand Button variant. Note: Tailwind v4.1 lacks a --duration-* theme namespace; durations are @utility blocks (verified through the postcss pipeline).
- PR 06 `fable/06-a11y-mobile`: checks green. Dark primary pairing 3.42:1 -> 5.53:1 (foreground flip, not primary: no L passes both button-fill and text-accent), live regions for streaming/thinking/voice, label sweep, dvh + resizes-content + safe areas, landmarks/skip/h1, reduced motion global + MotionConfig, 44px coarse-pointer targets at the Button primitive.
- PR 07 `fable/07-performance`: checks green. Sweeper partial index + memory covering index (plain CREATE INDEX, not CONCURRENTLY: Prisma wraps migrations in a transaction and the cited HNSW migration was already non-concurrent), throttle+memo+correct layout-effect deps, 75-message window (sanctioned fallback over virtualizer, reasons documented), LiveKit code-split behind first-call latch, terminal per-message cache, -react-virtuoso +dayjs (client), 17MB dead SVGs deleted + two heavyweights optimized/replaced, settings card split, setup.ts select. HNSW verification deferred with an operator note (needs live DB).
- PR 08 `fable/08-voice-terminal-telegram`: checks green (incl. py_compile). Voice mapping table, boot-fast worker + 15s client watchdog, hold-music flush both ends, Telegram failure messaging incl. no-key case, autoplay-block recovery, truthful call pill, 200-entry terminal cap, mobile terminal entry, persisted terminal state, Redis-less warnings, three leak fixes.
- PR 09 `fable/09-testing-ci`: checks green, pnpm test green (11 suites, 147 tests, ~1.2s, TZ-independence verified). Vitest + RTL + frozen-clock system-prompt snapshots + GitHub Actions (lint/typecheck + test jobs). Playwright E2E authored with the exact AI SDK wire format but NOT executed (no server allowed tonight); excluded from pnpm test, enablement stub in CI.
- PR 10 `fable/10-landing-page`: checks green, tests 147/147. Real sections composed, stub deleted, honesty pass on every dormant section (no fabricated stats, no competitor attacks), pills promoted into the hero, asymmetric feature grid with extracted GradientCard, AnimateOnView visible-by-default (LCP H1 never animates), floating-prompts deliberately left out.

- PR 11 `fable/11-voice-dictation-dedup` (added next morning from a live bug report): dictation typed each word ~80 times. Root cause: both speech hooks trusted `event.resultIndex` + `isFinal` slicing, but real engines re-deliver already-final results on every event with resultIndex stuck at 0, one event per interim update. Fixed with a per-recognizer delivered-text high-water mark in both hooks, plus a double-start race in dictation's start() (async guard let a double-tap spawn two recognizers, the first unstoppable). 8 regression tests simulating the buggy event sequences, mutation-checked (5/8 fail on the old code). Suite now 155/155.

**The working tree is left checked out on `fable/11-voice-dictation-dedup`** (the full stack applied). `git checkout feat/sales-tool-customizations` shows the before state.

To open the PRs: `bash .fable/open-prs.sh` from an account with write access (pushes the base + all ten branches, opens stacked PRs with the bodies in `.fable/NN-*.md`). Merge top-down starting with 01.

## Skipped and why

- **Opening actual GitHub PRs**: no write access (see the blocker at top). Everything else about the deliverable is done; `bash .fable/open-prs.sh` finishes it in one command.
- **Playwright E2E execution** (PR 09): authored but not run. Another session's dev server owned this working tree's port/.next all night (documented repo gotcha: parallel builds corrupt .next), so no server could be started. The spec + config + a commented CI stub are ready; the first run will likely need selector touch-ups on the onboarding walk.
- **True chat virtualization** (PR 07): shipped the brief's sanctioned fallback (75-message window) instead of @tanstack/react-virtual, because the dynamic-measurement + reverse-infinite-scroll + streaming-growth combination could not be runtime-verified tonight. Correctness beat the checkbox.
- **HNSW index verdict** (PR 07): needs a live-DB EXPLAIN ANALYZE. Not dropped blind; operator note with the exact command lives in memory-search.ts.
- **Blob storage for attachments** (PR 02): chose the honest 3MB cap instead; blob upload is the right follow-up if larger files matter.
- **Telegram/cron partial-reply persistence on abort** (PR 02/08): the web path persists partials now; generate()-based paths still lose them on supersede-abort. Smaller blast radius, deferred.
- Dark-mode `destructive` button contrast (~3.7:1), found during PR 06: the brief scoped the fix to --primary. One-line follow-up candidate.

## Found, not in the brief

- `train-mascot.tsx` aria-label said "Thomas the train mascot" (screen readers got the personal name even after the H1 fix). Fixed in PR 01.
- `claw-voice/src/agent.py` had two more personal leaks: the `VOICE_TURN_URL` fallback pointed at the developer's personal Vercel deployment (a self-hoster who forgot the env var would silently send their voice turns to someone else's server: privacy bug, not just branding), and the 401 error message said "tell Thomas". Both fixed in PR 01.
- `claw-voice/.env.example` shipped the personal LiveKit project URL and Vercel URL as the example values. Replaced with placeholders.
- Persisted chat error text carried a warning-emoji prefix; stripped along with the dev-logger emoji.

Severity-ranked additions from later PRs:

1. **(privacy, fixed in PR 01)** The voice worker's fallback URL sent self-hosters' voice turns to the developer's personal Vercel deployment if VOICE_TURN_URL was unset. Worse than branding: user audio-derived intents to someone else's server.
2. **(correctness, fixed in PR 02)** The brief's suggested fix for Stop data loss (onAbort on the agent config) is impossible: ToolLoopAgent in ai@6 has no onAbort setting, and onAbort's payload misses the in-flight step's text anyway. Fixed at the route driver instead, which captures strictly more.
3. **(correctness, fixed in PR 02)** Regenerate needed real server support: the SDK already sends trigger=regenerate-message, and a client-only wiring would have double-persisted the user row and double-appended the turn into the model context on every retry. Also added a fallback to normal submit when the failed send never persisted its user row (409/429/setup failures), or retries would silently drop the turn.
4. **(perf/bundle, fixed in PR 07)** lib/cron-format.ts was leaking moment (with all locales) into client bundles via two client components; the audit's moment grep missed it.
5. **(infra, PR 07)** The brief's CREATE INDEX CONCURRENTLY instruction would have broken prisma migrate deploy: Prisma wraps migrations in a transaction where CONCURRENTLY is a hard error, and the cited HNSW migration is in fact plain CREATE INDEX. Shipped non-concurrent with a comment.
6. **(latent bug, found in PR 09, not fixed)** estimateMessageTokens counts array-form user content by part count instead of text length; the pruner carries a corrected copy but token-estimation.ts does not. Compaction thresholds are wrong for attachment-bearing turns. Tests cover the string path only; flagged rather than silently changed.
7. **(tooling, PR 05)** Tailwind v4.1 has no --duration-* theme namespace: @theme duration tokens silently generate nothing. Shipped explicit @utility blocks, verified through the real postcss pipeline.
8. **(a11y, PR 06)** No primary lightness can pass AA both as button fill and as text accent on the dark background; the fix had to flip primary-foreground to dark ink. Any future "just darken primary" attempt will re-fail one side.

## Judgment calls

- PR 02, abort persistence: the brief's `onAbort` on the agent config is not supported by ToolLoopAgent in ai@6 (only streamText takes it), and its payload misses the in-flight step's partial text anyway. Implemented the persistence in the chat route's `after()` driver, which already sees every streamed part. Telegram/cron partial-loss on abort remains (they use `generate()`), noted for PR 08.
- PR 02, attachment fix: chose lowering the cap to 3MB decoded over blob-storage upload. No new infrastructure, honest limit. Blob upload is the right follow-up if bigger files matter.
- PR 02, stop semantics: per the brief, the stop route no longer force-clears the run claim when the abort didn't reach the run. On a Redis-less multi-instance deploy this means a remote run stays claimed until it finishes instead of racing a new send; that's the correct trade.
- PR 02, regenerate: implemented full server support (delete old reply, skip duplicate user row, no double-append into model context) since the SDK already sends trigger=regenerate-message; a client-only wiring would have corrupted history with duplicated turns.
- Browser-level verification skipped all night: another session's dev server owns this working tree (.next corruption gotcha is documented in repo memory), so verification is typecheck + lint + code reasoning.

- H1 replacement: "Claw ships while you sleep." Keeps the strongest hook, drops the personal name. Alternative was a generic "Your agent ships while you sleep."
- Brand tagline: "Self-hosted AI agent" instead of deleting the sub-line, so the brand lockup keeps its two-line shape.
- Testimonials: deleted rather than kept-but-empty. PR 10 will compose the landing page without a testimonials section since no real attributed quotes exist in the repo.
- `fly.worker.toml` app names (`thomasclaw-worker`) and LiveKit deployed URLs left alone: they identify live infrastructure; renaming breaks deploys.
- JSON-LD `creator` set to Organization "Composio" (repo owner org). Alternative was omitting creator entirely.
- Git identity: kept the machine-local `Foley <foley@Foleys-MacBook-Air.local>` author that all prior repo commits use.
- PR 03: forgot-password affordance REMOVED rather than gated on a nonexistent email-provider flag (no provider is wired in; inventing an env flag for a feature that can't work seemed worse). /reset-password stays for operator-minted links.
- PR 03: onboarding redo needed a real schema flag (`redoRequested` + migration); completion was previously implicit in "instance exists", so a query-param hack would not survive refreshes.
- PR 04: onboarding kept its own connect flow (richer keyMissing payload); the Toolkits page moved to the shared popup+poll hook.
- PR 05: chat send button keeps rounded-2xl to match the adjacent composer; brand-landing keeps its parameterized per-brand accents (converting to the theme gradient would break the brand-skin design) but gains the motion language.
- PR 06: tap targets via real coarse-pointer enlargement, not invisible hit-slop pseudo-elements (overlapping slop mis-taps in gap-1 rows).
- PR 08: sidebar toasts on call-ending chat switch (plumbing was cheap) instead of a blocking confirm; terminal log capped at 200 with Show-older instead of VirtualizedList (it owns its own scroll container and would break bottom-pinning and tool-focus highlight).
- PR 10: security section rewritten from competitor attack to TrustClaw's own verifiable posture; comparison de-named; floating-prompts left unimported (weakest layout, overpromising copy).

## Do not merge

Nothing is flagged as unsafe, but two PRs deserve the closest review:

- **PR 02 (chat correctness)**: the Stop/abort/regenerate paths were reworked at the route driver level and reasoned through carefully, but Stop-vs-partial-persistence races are exactly the kind of thing that only live testing proves. Suggested smoke test before merging: send, stop mid-stream, reload (partial persists); stop then immediately send (one run); regenerate after a success and after a 429.
- **PR 07's message windowing + PR 02's id-union merge** interact in chat-view.tsx: the window math accounts for prepends, and tests are green, but scroll through a 100+ message conversation once with devtools open before trusting it.

Everything else is low-risk: copy, styles, additive UI, tests, and indexes.
