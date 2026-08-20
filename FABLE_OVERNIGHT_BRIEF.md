# TrustClaw: Overnight Autopilot Brief

**To:** Fable
**From:** PM
**Mode:** Unattended. Nobody is awake. You will not get a clarifying answer, so make the call and document it.
**Blast radius:** Bold. You may refactor freely, introduce primitives, add test infrastructure, and delete dead code.
**Deliverable:** Ten stacked PRs, themed, individually mergeable. Not one giant branch.

---

## 0. The mission

TrustClaw is a self-hostable personal AI agent: Next.js 15 App Router, tRPC v11, Prisma + pgvector, Better Auth, AI SDK streaming, Composio tools, LiveKit voice, Telegram bot. About 30k LOC.

The engineering underneath is better than it looks. Typecheck is clean at 0 errors under `strict` + `noUncheckedIndexedAccess`. Lint is 0 errors across all 352 files in `src/`. Redis keys carry TTLs. `select` is used on every Message query. Streaming uses real backpressure with `after()` for background continuation. Secrets use real AES-256-GCM. Onboarding is resumable. Somebody cared.

The problem is the last mile. The app ships a landing page whose H1 says "Thomas ships while you sleep," structured data telling Google the product "probably sucks and your data is now being sold on Temu," and a Bible verse rendered above every chat. The Stop button silently deletes the user's reply. There are zero tests and zero CI. It reads as a talented engineer's weekend project, not a product.

**Your job: close the gap between the quality of the engine and the quality of the experience.** By morning this should feel like a product someone would pay for.

**Anti-goal, stated plainly:** it currently reads as AI-generated. Centered everything, gradient CTAs, emoji as icons, generic icon-plus-h3-plus-p card grids, zero motion language, default shadcn with no personality. Every change you make should move it away from that.

---

## 1. Non-negotiables

1. **Never use em dashes.** Not in code, comments, copy, commit messages, or PR descriptions. Use commas, colons, or parentheses.
2. **No emojis in the product UI.** Replace every emoji-as-icon with a lucide icon.
3. **Obey `CLAUDE.md`.** It is the house style and it is mostly good. Where reality already diverges (chat streaming is a Route Handler, not a tRPC subscription; the worker logs to stdout), update `CLAUDE.md` to describe reality rather than pretending.
4. **Never touch `.env`, never commit secrets, never modify CI credentials.**
5. **Every PR must leave `pnpm check` (lint + typecheck) green.** That is the floor, not the bar.
6. **If you break something you cannot fix, revert that hunk and log it.** A smaller correct PR beats a larger broken one.
7. **Do not add a dependency without noting it in the PR description with a one-line justification.**

---

## 2. Operating loop

For each PR, in order:

1. Branch from the previous PR's head. Name it `fable/NN-slug`.
2. Read the cited files before changing them. The line numbers below were accurate at commit time but may have drifted, so verify.
3. Make the change.
4. Run `pnpm typecheck` and `pnpm lint`. Both must be clean.
5. From PR 09 onward, run `pnpm test`. It must be green.
6. Commit with a real message. Body explains why, not what.
7. Open the PR with the acceptance criteria checked off, and note anything you skipped and why.
8. Append to `OVERNIGHT_LOG.md` at the repo root: what you did, what you found that was not in this brief, what you decided when the brief was ambiguous.

If a PR turns out to be much bigger than scoped, split it and keep going. Do not stall waiting for permission.

---

## 3. The ten PRs

### PR 01: Stop the bleeding (brand and copy integrity)

**Why first:** this is the smallest diff with the largest effect on whether the product reads as real. It is currently shipping things that would end a sales conversation.

| Fix | Location |
|---|---|
| H1 reads "**Thomas** ships while you sleep." Hardcoded developer first name in the public hero. | `src/app/_components/landing-page.tsx:35` |
| JSON-LD description shipped to Google: "Made By Sales People....it probably sucks and your data is now being sold on Temu." `creator.name` is "Sales People". On a product whose pitch is trust. | `src/app/page.tsx:8,18` |
| A component named `ComposioCta` renders **Proverbs 16:16** in a banner above every chat, for every user, forever. | `src/app/(authenticated)/dashboard/_components/chat/composio-cta.tsx:1-10`, used at `chat-view.tsx:430` |
| Fabricated testimonials with real-looking handles (`@sarahfin`, `@kalapolish`, `@GanatraSoham`), invented engagement counts (342 likes, 12.4K views), attacking a named competitor over security. Currently dead code, one import away from production. | `src/app/_components/testimonials-section.tsx:17-45` |
| "Brought to you by Cracked Cookies" rendered at `text-[8px]`. Below the legibility floor, and it undercuts a security product. | `src/app/_components/trustclaw-brand.tsx:12-14,40` |
| Footer: "Made by sales people. Driven by a train. Your mileage may vary." | `src/app/_components/landing-page.tsx:75` |
| `CLIENT_INFO = { name: "thomas-claw" }` leaks a personal fork name into every MCP handshake for every self-hosted deployment. | `src/server/clients/mcp.ts:7` |
| Emoji used as UI: `🚂 Now boarding`, `On the house 🍻`, `💼`/`🎉` as option icons, `✕` instead of lucide `X`. | `landing-page.tsx:27`, `model-settings.tsx:97`, `model-picker.tsx:123`, `writing-style-step.tsx:62,75`, `connection-tool-result.tsx:42`, `workbench-tool-result.tsx:163` |

**Acceptance:** grep the repo for `Thomas`, `Temu`, `Cracked Cookies`, `Proverbs`, `thomas-claw` and get zero hits in shipped code. Zero emoji in `src/app` and `src/components`. Delete `testimonials-section.tsx` outright unless PR 10 replaces its contents with real, attributed quotes.

---

### PR 02: Chat correctness

**Why:** the chat is the product, and three of its core behaviors are broken in ways that lose user data.

**P0.1 Stop deletes the user's reply, permanently.**
`src/server/api/routers/trustclaw/agent/setup.ts:496` configures the agent with `onFinish` only. In `ai@6`, `onFinish` is not called on abort (`onAbort` is). So when a run aborts, nothing persists the streamed text, and then `src/app/api/chat/route.ts:314-317` and `src/app/api/chat/stop/route.ts:48-57` both actively `deleteMany` the empty assistant row. The UI keeps showing the partial (`chat-view.tsx:226-236`), so the user believes it was saved. Reload and the entire turn is gone.
**Fix:** add `onAbort` that persists the partial steps (same body as `onFinish`, flagged `stopped: true`). Stop deleting the row on abort.

**P0.2 Stop does not stop the server run in production.**
`agent/run-registry.ts:15` keeps abort controllers in a process-local `Map`. `/api/chat/stop` is a different route from `/api/chat`, so on Vercel it lands on a different lambda, `abortRun()` returns `false`, and the model keeps generating. With `maxDuration = 300` (`route.ts:102`), that is up to five more minutes of tool-calling the user explicitly paid to stop.
**Fix:** Redis abort flag. The client already exists. `SET abort:<conversationId> 1 EX 300` in the stop route, poll it from the `after()` loop in `route.ts:291`, abort the controller locally. Same pattern as `clearStreamingMessage`.

**P0.3 Stop-then-send starts two concurrent runs on one conversation.**
`stop/route.ts:42` calls `markRunEnded` unconditionally, even when the abort never reached the run. The orphan keeps streaming and will write its own assistant row. The UI unblocks, the user sends again, `tryClaimRun` (`route.ts:218`) sees a null flag and succeeds. Two runs now write into the same conversation and the orphan's reply lands after the new one, poisoning the next turn's context.
**Fix:** only `markRunEnded` when `aborted === true`. Let the orphan clear its own claim.

**P0.4 Enter sends mid-IME-composition. CJK input is unusable.**
`chat-input.tsx:228-234` has no `isComposing` guard. Japanese, Chinese, and Korean users press Enter to commit an IME candidate and instead send a half-typed message.
**Fix:** `if (e.nativeEvent.isComposing || e.keyCode === 229) return;` at the top of the handler. One line.

**P0.5 Older messages silently vanish after every turn.**
`chat-view.tsx:213-239` calls `setMessages(initialMessages)` when the stream finishes. `getHistory` pages at `limit: 10` (`trustclaw-chat.tsx:14`), so the refetched page holds 10 rows while the local list holds 12. The adopt branch fires and truncates the visible list back to 10, dropping the two oldest bubbles.
**Fix:** merge by id union instead of replacing. Keep locally-known messages that fall outside the server page window. This also fixes the full-list remount at end of stream (every `key` changes at once, resetting copy buttons and tool timers).

**P0.6 Attachment limit exceeds the platform body limit.**
`chat-input.tsx:66-67` and `route.ts:28` advertise 25MB. Attachments are base64 data URLs inside the JSON POST body (`route.ts:164-190`). Vercel caps request bodies at 4.5MB. Anything over roughly a 3MB source file fails at the edge with a non-tRPC error the client renders as a generic "Message failed."
**Fix:** drop the advertised cap to ~3.5MB decoded, or upload to blob storage and send URLs. Pick one, state which in the PR.

**P1, same PR:**
- Wire up **regenerate** and **inline error retry**. `use-chat-hook.ts:118-126` already receives `chat.regenerate` and `chat.clearError` from the SDK and throws them away. `chat-view.tsx:88` destructures everything except `error`. There is currently no way to retry a bad answer except retyping the prompt, and a stream that 500s before the first token shows nothing at all.
- Stop hard-disabling the composer while streaming (`chat-input.tsx:472`). Let the user type ahead. This also deletes the focus-restore hack at `:144-153`.
- Persist drafts per conversation. `chat-input.tsx:103` is a bare `useState("")` and `trustclaw-chat.tsx:83` remounts on conversation switch, so switching chats destroys whatever you were typing.
- Markdown quality in `assistant-message.tsx:116`: syntax highlighting, per-block copy button, `a` override with `target="_blank" rel="noopener noreferrer"`, table overflow wrapper. This is a developer-facing agent shipping code blocks as grey boxes with `whitespace-pre-wrap` (which mangles indentation).
- Surface data already fetched and discarded: `createdAt` and `inputTokens`/`outputTokens` come back from `getHistory.ts:45-47` and are dropped in `trustclaw-chat.tsx:63-69`. Add timestamps and a token counter.
- `chat-view.tsx:46-50` hardcodes sample prompts ("Summarize my emails for today") shown to users who have connected nothing. Derive from connected toolkits, fall back to connection-free prompts.

**Acceptance:** Stop mid-stream, reload, partial reply is still there. Stop, then immediately send again, exactly one run exists. Type in a Japanese IME and press Enter to commit a candidate, no message is sent. Open a conversation with 20 messages, send one, scroll up, nothing is missing.

---

### PR 03: Activation path

**Why:** a new user currently hits a wall the previous screen promised them they would not hit.

**The contradiction.** `onboarding/integrations-step.tsx:110-113` tells the user, verbatim: *"No key needed to finish, let's keep going."* They click Continue. `dashboard/page.tsx:34-43` immediately renders `ComposioActivationGate`: a full-page, unskippable wall demanding a Composio API key, with a link telling them to go create a third-party account. Chat, memory, and the free house models all work fine without Composio. Gating the entire product on it is gating it on an unrelated dependency.
**Fix:** demote the hard gate to a dismissible banner (`composio-key-banner.tsx` already exists and does exactly this). Let the user chat immediately. If the gate must stay, move the ask into the integrations step and delete the "no key needed" copy.

**Also in this PR:**
- **Password reset is a dead end.** `server/auth.ts:198-210` only `console.warn`s the reset link, and `forgot-password-form.tsx:61-65` honestly tells the user to "ask whoever runs this instance to grab it for you." Wire an email provider (the code comment says it is a one-line change), or hide the "Forgot password?" link on hosted deployments.
- **No deep-link preservation.** `(authenticated)/layout.tsx:32` redirects to bare `/login`, `login-page.tsx:117` always pushes `/dashboard`. A logged-out user clicking a link to `/dashboard/settings` loses their destination. Add `?next=` and honor it.
- **Session expiry leaves the user stranded.** `clients/trpc/errors.ts:5` toasts "Please log in again" and does nothing. Redirect to `/login?next=<current>`.
- **Onboarding saves are fire-and-forget.** `onboarding.tsx:185,193` call `void persistState(...)` on a mutation with no `onError` (`:165`). Network blip, unhandled rejection, no toast, user advances believing progress was saved. Add `onError: trpcToastOnError` at minimum.
- **Progress counter lies.** `progress-dots.tsx:5` hardcodes `total = 8`, but the flow ends at step 7 when Telegram is not configured (`onboarding.tsx:426,430`). The last screen a user sees reads "Step 7 of 8" and then onboarding just ends.
- **Anthropic key entry never says it is encrypted** (`model-step.tsx:137-148`), while the Composio gate does (`composio-activation-gate.tsx:49-51`). The key *is* encrypted. Free trust win, currently left on the table. Standardize the copy across all five credential surfaces.
- **OAuth refusal hardcodes `@composio.dev`** (`login-page.tsx:41`) regardless of what `ALLOWED_EMAIL_DOMAINS` says. The server already builds the correct message (`auth.ts:101-108`). Surface it.
- **Brand demo CTAs land on the wrong tab.** `brand-landing.tsx:42,66,73` all point at `/login`, which opens the Login tab. Prospects arriving from a per-brand demo link get a login form for an account they do not have. Point them at `/login?tab=register` like the main landing does.
- **Add a non-destructive "Re-run setup."** Today the only way back through onboarding is `danger-zone.tsx:25` `deleteInstance`, which nukes everything.

**Acceptance:** create a fresh account, complete onboarding with the free model and zero integrations, and land in a working chat that answers a message. No wall, no contradiction, no dead end.

---

### PR 04: Settings integrity

**Why:** several settings surfaces lie to the user by omission.

**P0.1 Query errors render as empty states across ~30 call sites in ~23 files.** Each destructures only `data`/`isLoading`, never `error`, then branches on `length === 0`. A failed fetch is indistinguishable from "you have none of these." A user with a working Anthropic key sees "not connected." A user with five skills sees "No skills yet." Worst offenders: `custom-models-settings.tsx:25`, `mcp-servers-settings.tsx:23`, `knowledge-buckets-settings.tsx:52`, `skills-settings.tsx:51`, `personality-settings.tsx:65`, `memory-settings.tsx:20-26`, `cron-jobs-settings.tsx:67-81`, `anthropic-api-key-settings.tsx:24`, `composio-api-key-settings.tsx:24`, `voice-settings.tsx:38`.
`cron-run-history.tsx:20-51` and `toolkits-client.tsx:27-47` already do this correctly. Copy that pattern everywhere.

**P0.2 Two destructive actions have no confirmation.** `memory-settings.tsx:77-88` (delete memory) and `mcp-servers-settings.tsx:79-88` (remove MCP server) fire straight off the trash icon `onClick`. Every other delete in the app is wrapped in `AlertDialog`. These two are the outliers.

**P0.3 Timezone is fully modeled server-side and has zero UI.** `prisma/schema.prisma:36` (`User.timezone`), `updateSettings.ts:126-128` (persists it), `getCronJobs.ts:25` (fetches it), `agent/tools/schedule.ts:19` (the agent falls back to it). A repo-wide grep across `src/app/**/_components` returns zero hits. A US user who asks for a "daily 8am digest" silently gets 8am UTC. Add a timezone field defaulting to `Intl.DateTimeFormat().resolvedOptions().timeZone`, and show the zone next to "Next run."

**P0.4 There is no way to disconnect a toolkit anywhere in the app.** `routers/toolkits/index.ts:1-8` exposes only `getToolkits` and `getAuthLink`. `toolkit-card.tsx:79-83` renders connected toolkits as a static pill with no action. Once you authorize Gmail, the only way to revoke it is to leave the app. For a product named *TrustClaw*, this is the gap that matters most. Add a `toolkits.disconnect` mutation behind a confirm.

**P0.5 `cron-jobs-settings.tsx:30-56` is a stale forked copy of `lib/cron-format.ts`**, missing the `isPlain()` guard that exists specifically to stop `*/15`, `1-5`, and `0,30` from rendering as garbage like "Every hour at :*/5". Delete the fork, import the lib, exactly as `conversation-sidebar.tsx:20` already does.

**P0.6 Custom-model keys are the only credential never validated against the provider.** `addCustomModel.ts:62-76` does prefix string matching and stores. `setAnthropicApiKey.ts`, `setComposioApiKey.ts`, and `setVoiceApiKey.ts` all make a real upstream call and reject on failure. A typo'd key saves "successfully" and fails opaquely at chat time.

**P1, same PR:**
- **Zero forms in the app use react-hook-form**, despite `CLAUDE.md` mandating it. Every dialog hand-rolls `useState` per field and re-derives validation in JSX, duplicating regexes the `.schema.ts` files already own (`custom-models-settings.tsx:57` vs `addCustomModel.schema.ts`). The schemas exist and are ready to import. The shadcn `form.tsx` primitive is installed and unused. Migrate: `knowledge-buckets`, `personality`, `skills`, `skill-creator-dialog`, `custom-models`, `mcp-servers`.
- **Cron toggle has an unguarded double-mutation race.** `cron-jobs-settings.tsx:231-240` has no `disabled={toggleCronJob.isPending}` on the Switch, while its optimistic `onMutate`/rollback pattern is only safe for one in-flight call. `conversation-sidebar.tsx:404` and `skills-settings.tsx` both guard correctly. This one file is the outlier.
- **Two incompatible toolkit-connect flows.** Onboarding (`integrations-step.tsx:124-145`) opens a popup, polls, and toasts on completion. The Toolkits page (`toolkit-card.tsx:35-46`) does a full `router.push` that navigates the tab away, with no return handling and no error state for a denied consent. Unify on the popup pattern.
- **Danger Zone copy undersells the blast radius.** `danger-zone.tsx:49-52` says "messages, memories, and cron jobs." Per the cascade relations in `schema.prisma:158-167` it also destroys personalities, skills, custom models and their provider keys, MCP servers, buckets, conversations, and generated images. Enumerate it honestly.

**Acceptance:** kill the network, open Settings, and every card says something true. Delete a memory and get asked first. Create an 8am cron in `America/Los_Angeles` and have it fire at 8am Pacific.

---

### PR 05: Design system

**Why:** the tokens are genuinely good and the discipline is real (there is not a single hardcoded `text-gray-500` in the app, which is rarer than it sounds). What is missing is the last mile: motion, hierarchy, and finished states.

**Motion. This is the single highest-leverage change in the entire brief.** There are 52 `transition-*` declarations across `src/` and **zero** `duration-*` and **zero** `ease-*`. Every transition in the product runs Tailwind's default 150ms curve. That is *why* it feels generic. Linear and Raycast are defined by their easing.

Add to `@theme` in `globals.css`:
```css
--ease-out-quad: cubic-bezier(0.25, 0.46, 0.45, 0.94);
--ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1);
--duration-fast: 120ms;   /* color, opacity */
--duration-base: 200ms;   /* transform */
--duration-slow: 320ms;   /* overlays */
```
Then enforce it. **Replace every `hover:scale-*` with a 1px lift plus a shadow step** (`landing-nav.tsx:18`, `landing-page.tsx:47`, `chat-input.tsx:497`, `conversation-sidebar.tsx:169`, `composio-activation-gate.tsx:72`, `step-layout.tsx:78`, `chat-view.tsx:450`, `trustclaw-brand.tsx:25`). Scale-on-hover is a Bootstrap-era tell. Add `active:translate-y-0 active:brightness-95` so buttons physically depress.

**Fix the logo hue.** `openclaw-logo.tsx:15,34,41,52,59,70` hardcodes `oklch(0.488 0.243 264.376)`, which is shadcn's *default* chart color at hue 264. The brand `--primary` is hue **287**. In `trustclaw-brand.tsx` the glyph (264) sits two centimeters from the wordmark (287), in every navbar and on the login page. Two different purples. Same stale token in `onboarding-claw-logo.tsx`, `features-section.tsx:81,121,163`, `hero-section.tsx:66`, `bottom-cta-section.tsx:10`. Replace all with `var(--primary)`.

**Fix the gradient contrast bug.** `.text-gradient` correctly gets a `.dark` override (`globals.css:288-294`) with a comment explaining why. `.bg-accent-gradient` (`:295-301`) did not, so it hardcodes the dark-mode lightness in both themes. Every gradient CTA pairs it with `text-white` at roughly **3.8:1**, below AA. Add the `.dark` variant, darken the `:root` stops, and swap `text-white` for `text-primary-foreground`.

**Publish a type ramp and kill the 57 arbitrary sizes.** There are 34 uses of `text-[10px]`, 20 of `text-[11px]`, two of `text-[9px]`, and one of `text-[8px]`. Add one token (`--text-2xs: 0.6875rem`) and codemod them. Delete `text-[8px]` and `text-[9px]` outright.

**Build the three missing primitives.**
- `Spinner` (`components/ui/spinner.tsx`). `CLAUDE.md` mandates it, it does not exist, and there are 20+ hand-rolled `<Loader2 className="animate-spin">` at four different sizes.
- `EmptyState` (`components/core/`). Today: "No buckets yet." "No skills yet." "No actions yet." Bare sentences, no icon, no explanation, no action. Loading and empty are ~40% of what a new user actually sees.
- Per-panel `.skeleton.tsx` for every settings card. They currently show a centered spinner, so panels collapse to zero height and snap to full height. Layout shift on every load.

**Make focus a first-class state.** 83 `hover:` versus 7 `focus-visible:`. The chat prompt chips (`chat-view.tsx:445`), the Chats/Scheduled toggle (`conversation-sidebar.tsx:139`), voice rows (`voice-picker.tsx:52`), and the Live/Receipts toggle (`terminal-pane.tsx:142`) are all hover-only. `model-picker.tsx:67` actively strips the outline and substitutes a background tint.

**Give the dark theme real depth.** `--card` (0.205) sits four points above `--background` (0.165) and `--border` is 9% white, so cards are nearly invisible without a shadow. `.elevated` and `.glass` are already written (`globals.css:304-324`) and used on exactly one surface. Apply them: `.elevated` on every settings Card, `.glass` on every overlay. Add a two-step shadow scale so hover has somewhere to go.

**Unify the CTA.** The same "Get Started" button renders three different ways (`rounded-md` solid, `rounded-2xl` gradient, `rounded-xl` gradient). Add a `brand` variant to `buttonVariants` and never restyle a Button at the call site. Publish a radius rule: controls `rounded-lg`, cards `rounded-xl`, modals `rounded-2xl`, pills `rounded-full`, nothing else.

**Acceptance:** zero `hover:scale-*` in `src/`. Zero `text-[Npx]` under `text-xs`. Every `transition-*` carries an explicit duration and easing. One purple in the app.

---

### PR 06: Accessibility and mobile

**Why:** `CLAUDE.md` claims "mobile-first, every component MUST be usable on mobile." It is not true yet, and the a11y gaps include one that is a WCAG failure on the most-clicked button in the app.

**P0.1 Dark-mode default button text fails contrast at ~3.45:1** (AA needs 4.5:1). `globals.css:102` (`--primary`) plus `button.tsx:12`. Dark is the default theme (`theme-provider.tsx:9`). The Stop button (`chat-input.tsx:481-490`) renders this failing combo on every single streaming reply. Darken `--primary` in `.dark` or lighten `--primary-foreground`.

**P0.2 Streaming chat is completely silent to screen readers.** Zero `aria-live` anywhere in application code. The thinking indicator (`thinking-indicator.tsx:16-22`), the streaming assistant message, and the voice call-phase label (`chat-input.tsx:294-329`) all announce nothing. For an AI chat product this is the core loop being inaudible. WCAG 4.1.3.

**P0.3 The account-deletion confirm input has no label.** `danger-zone.tsx:77-84`: the `<Label>` has no `htmlFor`, the `<Input>` has no `id`. The confirmation field for a permanent, irreversible action announces nothing. Every other form in the app does this correctly.

**P0.4 The iOS keyboard covers the chat composer.** `dashboard/layout.tsx:14` uses `h-screen` (100vh) for the entire authenticated shell, and `app/layout.tsx:41-44` has no `interactiveWidget: "resizes-content"`. Textbook iOS Safari bug: the keyboard opens, 100vh does not shrink, the message box ends up behind the keyboard. The team already knows about `dvh` (used correctly in `dialog.tsx:64`, `not-found.tsx:10`) and never applied it to the main shell. Also: **zero `safe-area-inset` usage anywhere**, so on notched iPhones the composer and the bottom Sheet sit under the home indicator.

**P1:**
- No `<nav>` landmark anywhere (`dashboard-navbar.tsx:54`, `landing-nav.tsx:10` both use bare divs in a `<header>`).
- No skip-to-content link anywhere.
- `/dashboard`, the most-used page in the product, has no `<h1>`. The only heading is an `<h2>` that renders exclusively in the empty state.
- **Zero `prefers-reduced-motion` handling** despite 11 keyframes including six infinite loops, plus framer-motion driving all of onboarding. Vestibular trigger.
- **No button size in the design system reaches 44px.** `button.tsx:23-32`: default `h-9` (36px), `sm` `h-8`, `xs` `h-6`, `icon` `size-9`. Onboarding explicitly patched this with `min-h-[44px]` in several spots, so the pattern is known, just not applied at the primitive level. Fix it at the primitive.
- Unlabeled inputs: `toolkit-search.tsx:19-24`, `personality-settings.tsx:318-323`, and the bare inline rename `<input>` at `conversation-sidebar.tsx:219-230`.

**Acceptance:** run the app at 375px wide with a software keyboard open and send a message without the composer being covered. Tab through the dashboard and never lose the focus ring. Axe reports zero criticals.

---

### PR 07: Performance

**P0.1 The cron sweeper full-table-scans and row-locks every 60 seconds.** `vercel.json:5` runs it every minute. `api/cron/trustclaw/route.ts:76-102` queries on `enabled`, `nextRunAt`, and `lockedAt`, but the only index is `@@index([instanceId, nextRunAt])` (`schema.prisma:386`), whose leading column is not in the predicate. Cost grows linearly with total cron jobs across all tenants, 1,440 times a day.
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "composio_claw_cron_job_enabled_next_run_idx"
  ON "composio_claw_cron_job" (enabled, "nextRunAt") WHERE "lockedAt" IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "composio_claw_memory_instance_category_created_idx"
  ON "composio_claw_memory" ("instanceId", category, "createdAt" DESC);
```
(`CONCURRENTLY` cannot run inside Prisma's transactional migration wrapper. Follow the pattern the existing HNSW migration uses.)

**P0.2 The chat message list is neither virtualized nor memoized.** `chat-view.tsx:468-493` maps into a plain div. Zero `React.memo` in the entire chat tree (grep confirms). `useChat`'s `messages` array gets a new reference on every token, so every mounted message re-renders and `react-markdown` re-parses the full accumulated text of *every* message, not just the streaming one. Cost is O(messages loaded) per token, and history prepends without a cap. This is an always-on agent product with long conversations: the worst possible case for that combination. Also `use-chat-hook.ts:45` does not set `experimental_throttle` (the option exists), and `chat-view.tsx:197-203` has a `useLayoutEffect` with **no dependency array** reading `scrollHeight`, forcing a synchronous layout flush per token.
**Fix:** `experimental_throttle: 50`, `React.memo` on `AssistantMessage`/`UserMessage`, a dep array on that effect, and virtualize via the already-installed `@tanstack/react-virtual`.

**P0.3 LiveKit ships to every chat page load.** `chat-view.tsx:36-40` statically imports `VoiceCall`, which pulls `livekit-client` (1.19MB own ESM bundle) and `@livekit/components-react` (~440KB of dist chunks). Conditional JSX does not code-split. There is no `next/dynamic` anywhere in the codebase (0 matches). Every user who opens `/dashboard` downloads the voice stack whether or not they ever place a call.
**Fix:** `next/dynamic(() => import("./voice-call"), { ssr: false })`, loaded on first call-button press.

**P1:**
- `TerminalPane` recomputes the entire tool-call log from scratch on every token (`terminal-pane.tsx:80-103`, `:40-51`), scanning all historical messages, keyed on an array reference that changes every token.
- **`react-virtuoso` is installed (248KB) and imported by nothing.** Remove it.
- **moment is ~70KB gzipped** because bundlers include all ~200 locales unless told otherwise, and this app never restricts them. Five client files use it. Swap for dayjs (~2KB) or date-fns. Keep `moment-timezone`: it is server-only and correct. Update `CLAUDE.md` when you do.
- **~18MB of dead SVGs in `public/images/elements/`** (`layers.svg`, `circle_tunnel.svg`, etc. at ~2.4MB each), referenced nowhere. That is 18 of the 20MB in `public/`. And two that *are* used on the homepage are 605KB and 572KB (`rays_left.svg`, `quarter_circle.svg`): over 1MB on the page prospects see first. Optimize or replace.
- The settings page mounts all 13 sections in one client bundle with no split. Visiting Settings to flip one toggle pays for all thirteen.
- `agent/setup.ts:107-109` fetches the full instance row (including three long prompt columns and three encrypted keys) with no `select`, on every turn.
- The pgvector HNSW index is very likely never used: every real query is `WHERE instanceId = X ORDER BY embedding <=> ...`, and with a selective equality prefilter and no per-tenant partial index the planner will use the B-tree and brute-force the small subset. Verify with `EXPLAIN ANALYZE`. If confirmed, drop the index (it costs write overhead for no read benefit) or adopt `hnsw.iterative_scan`.

**Acceptance:** send a 40-message conversation and confirm the DOM holds a window, not 40 nodes. Chrome Performance shows no layout thrash per token. `/dashboard` first-load JS drops by at least 1MB.

---

### PR 08: Voice, terminal, Telegram

**P0.1 The voice picker is a no-op for spoken replies.** `smallest.ts:5-16,24-42`: `CURATED_VOICES` are OpenAI Realtime voice ids (`marin`, `cedar`, `ash`). `resolveSmallestVoice()` only recognizes a disjoint Smallest set (`avery`, `mia`), so **every** user selection falls through to the default. Both the inline picker and `voice-settings.tsx:122-125` tell the user their choice affects spoken replies. It only affects live LiveKit calls. Typed-chat TTS and the Settings "Test" button always speak in Avery regardless.

**P0.2 A missing realtime key produces a dead, silent call.** `claw-voice/src/agent.py:99-114` raises if `OPENAI_API_KEY` is unset, and `:285-287` calls it unguarded. In a self-hosted deploy with two separate `.env` files this is very plausible. Client-side there is no timeout for "the agent never spoke." The user taps Call, the mic goes live, the room connects, and then nothing happens, forever, with no error.

**P0.3 Hold music can get stuck on for the rest of the call.** `api/voice-turn/route.ts:108-150` breaks the SSE loop on abort without emitting a matching `status: "done"` for the in-flight tool. `voice-call.tsx:268-287` only removes a tool id from `runningToolsRef` on `"done"`, so `running.size` never returns to zero and the arpeggio loop plays continuously through the rest of the conversation.

**P0.4 Telegram never tells the user when a run fails.** `api/telegram-webhook/route.ts:112-121` wraps the whole background run in a `.catch(console.error)` with no `sendTelegramMessage`. Worse, `prepareAgentRun` (`:210`) is called *outside* the inner try/catch, so its failures (including the fail-closed `PRECONDITION_FAILED` when no Anthropic key is set) skip the one path that does message the user. A user whose key is not set sees "typing..." and then nothing, permanently.

**P0.5 Voice can silently fail after a reload.** `use-chat-hook.ts:43,51` resumes an in-flight stream on mount with no user gesture. If voice was toggled on in a previous session (persisted to localStorage), `speak()` fires without the audio element ever having been unlocked, `audio.play()` throws `NotAllowedError`, and the catch at `use-voice-playback.ts:204-210` swallows it. Voice is "on," the reply is on screen, nothing is spoken, no explanation.

**P1:**
- Switching conversations mid-call silently drops the LiveKit call with no toast (`conversation-sidebar.tsx:264-268`).
- The call-status pill never shows "Thinking" or "Speaking" during a real call: `chat-view.tsx:407-412` hardcodes it to `muted` or `listening`, so it reads "Listening..." while the agent is mid-sentence.
- The terminal log has zero virtualization despite `VirtualizedList` already existing in the codebase, and it builds entries from every tool call across the whole conversation (`terminal-pane.tsx:80-103`, `cockpit-view.tsx:42-71`).
- The mobile terminal Sheet has no standalone entry point: the navbar toggle is `hidden md:inline-flex` (`dashboard-navbar.tsx:136`), so on a phone it can only be opened by tapping an existing tool-call chip.
- Terminal open/closed state does not persist, though its width does.
- Redis-less deployments silently lose Telegram dedup and the supersede-abort mechanism (`redis.ts:129,153,170`) with no warning logged. Telegram retries far more than the web path.
- Leaks: `voice-call.tsx:279-283` has an unmount-uncleaned grace timer, `terminal/types.ts:15` has a module-level `timestampCache` Map that is never pruned, and `voice-settings.tsx:100-107` leaks a blob URL on rapid repeat Test clicks (it overwrites `onended` instead of revoking).

---

### PR 09: Testing and CI foundation

**Ground truth, verified:** zero test files. No test runner configured. **No `.github` directory at all.** `@playwright/test` is installed and entirely unused. Typecheck: **0 errors**. Lint: **0 errors, 0 warnings** across all 352 files in `src/` (the 13 lint errors that exist are all in the ancillary `cli/` package plus a generated file). So the baseline is clean. The risk is behavioral, not structural: strict types catch shape mismatches, not a wrong compaction ratio or a system prompt that advertises tools that do not exist in incognito mode.

**Runner: Vitest.** The project is ESM-native (`"type": "module"`, `verbatimModuleSyntax`) on Next 15 + React 19. Vitest needs no `--experimental-vm-modules` or babel transform layer, reads the `~/*` path aliases from tsconfig directly, and the AI SDK (already a dependency) ships `ai/test` with `MockLanguageModelV2` and `simulateReadableStream` for exactly this. Playwright stays for E2E.

**Day 1, zero infrastructure required.** These are pure functions, load-bearing and completely untested:

| Target | Why it matters |
|---|---|
| `server/clients/crypto.ts` | The only thing between a stored API key and plaintext at rest. Test the roundtrip, the dev passthrough, the fail-closed-in-production branch, and `enc:v1:` prefix detection so legacy rows are not double-encrypted. |
| `agent/context/context-pruning.ts` | Three-tier logic (soft-trim at 30%, hard-clear at 50%, protected last-3-turns boundary) that silently rewrites conversation history if wrong. |
| `agent/error-parser.ts` | This is the literal text a stuck, paying user reads. Every regex branch. |
| `agent/context/token-estimation.ts` | Wrong thresholds either thrash or blow the context window. |
| `agent/strip-tool-echoes.ts` | Enforces the "never echo raw tool JSON" prompt rule. Five lines, fully exhaustible. |
| `lib/cron-format.ts` | A dozen untested branches of user-facing text. |
| `lib/username.ts` | Client/server contract that must match the Better Auth plugin config. |
| `telegram-webhook.schema.ts` | First parser touching untrusted external input. |
| `agent/tools/index.ts` `createCustomTools` | **Safety-critical and unverified:** incognito must actually drop the memory tools. The system prompt comments note that advertising absent tools makes the model hallucinate saves. |

**Land the `lint-and-typecheck` GitHub Actions job by itself, first.** It costs nothing (both already pass) and it is the cheapest possible way to stop the next regression. Do not wait for the rest of the suite.

**Week-1 shape (build as much as you get to):** Postgres + Redis integration tier (the images are already in `docker-compose.yml`: `pgvector/pgvector:pg16`, `redis:7-alpine`); golden-file tests on `system-prompt.ts` with the clock frozen (it calls `moment().tz()`, so an unfrozen snapshot breaks daily); RTL suite on `chat-input.tsx` (fully prop-driven, needs zero mocking, highest interaction surface); and exactly **one** green E2E journey (signup, onboarding, first chat, model mocked via `page.route()`). That one test forces the whole harness to exist. Every journey after it is incremental.

**tRPC harness note:** `createCallerFactory(appRouter)` is already exported from `server/api/root.ts`. But `createTRPCContext` only produces `{ headers, session }`: there is no `ctx.prisma`. Every procedure imports the `db` singleton directly. So mock the module (`vi.mock("~/server/clients/db")`), not the context.

**Streaming, deterministically:** two layers. In Playwright, `page.route()` the `/api/chat` fetch with a canned UI-message-stream body. In Vitest, `vi.mock` `resolve-model` to return `MockLanguageModelV2`, which exercises the real `ToolLoopAgent` loop, real tool execution, and real `onFinish` persistence without touching Anthropic. That is the only way to get deterministic coverage of `onFinish`'s tool-result pairing by `toolCallId` (which the code itself flags as bug-prone if paired by index).

---

### PR 10: The landing page

**The finding that reframes everything:** a complete, well-built marketing site already exists and **ships to nobody**. `hero-section.tsx`, `features-section.tsx`, `comparison-section.tsx`, `testimonials-section.tsx`, `security-section.tsx`, `bottom-cta-section.tsx`, `floating-prompts-section.tsx`, and `chat-mockup.tsx` are imported by **zero** files. Meanwhile `page.tsx:26` renders `landing-page.tsx`: 80 lines of nav, mascot, one headline, five pills, and a footer. No screenshot. No product explanation. Someone swapped in a stub and never wired the sections back.

**Do:**
1. Compose the real page: `LandingNav`, `HeroSection`, `SecuritySection`, `FeaturesSection`, `ComparisonSection`, `BottomCtaSection`. Delete `landing-page.tsx` or demote it to `/demo`.
2. **Replace `TestimonialsSection` contents entirely** (see PR 01). Real attributed quotes or nothing. Do not ship invented tweets with fabricated engagement counts attacking a named competitor.
3. **Left-align the section headers.** Every section in the file is centered (`features:218`, `testimonials:126`, `comparison:77`, `bottom-cta:21`). The one exception, `security-section.tsx:29-38`, is left-aligned and is the best-looking section in the repo. Centered stacks read as a template. Cap prose measure at `max-w-[65ch]`.
4. **Break the card grid.** `features-section.tsx:79-202` is the canonical AI-slop pattern: circle icon, h3, p, times six, in a 2-then-4 grid, with a `p-px` gradient-border wrapper duplicated verbatim three times. Extract the wrapper into one `GradientCard`. Make the layout asymmetric.
5. **Fix `AnimateOnView`.** `animate-on-view.tsx:27,54` initializes at `opacity: 0`. If JS fails, IntersectionObserver does not fire, or the visitor is a crawler, **the hero H1 and every section body is invisible**. The H1 is also the LCP element, deliberately hidden until an observer fires. Never animate above-the-fold content. Gate the rest on `prefers-reduced-motion: no-preference` so the reduced-motion path is `opacity: 1`.
6. Rewrite the copy to say what the product is inside five seconds: self-hostable, your keys, vector memory, 500+ tools via Composio, Telegram bot, runs while you sleep. The five pills at `landing-page.tsx:7-13` are the strongest copy on the current page and they are 12px and below the fold. Promote that concreteness.

---

## 4. Guardrails

- **Do not touch `.env`, `.env.local`, or `.vercel/`.**
- **Do not change the Prisma schema without a migration.** Use `prisma migrate dev`, never `db push` (the repo has versioned migration history and `CLAUDE.md` is explicit about this).
- **Do not delete `claw-voice/`.** It is the Python LiveKit worker and it is load-bearing.
- **Do not "fix" `dashboard/page.tsx`'s deliberate skipped prefetch.** It carries a documented React #418 rationale.
- **Do not rewrite the agent loop, the compaction system, or the resumable-stream machinery.** They are the best code in the repo. Fix the specific bugs named in PR 02 and leave the architecture alone.
- **Do not chase a coverage percentage.** Land the nine pure-function suites and one green E2E. That is worth more than 60% coverage of getters.
- If you find something genuinely worse than anything in this brief, **fix it and put it at the top of the log.**

---

## 5. The morning report

Write `OVERNIGHT_LOG.md` at the repo root. Not a changelog (the PRs are the changelog). I want:

1. **Shipped:** the PRs, each one line, each with its branch name and whether checks are green.
2. **Skipped and why:** anything in this brief you did not do, with the reason. "Ran out of time" is a fine reason. Silence is not.
3. **Found, not in the brief:** anything you discovered that I did not know about. Severity-ranked. This is the section I will read first.
4. **Judgment calls:** every place the brief was ambiguous and you picked. What you picked, and what the alternative was.
5. **Do not merge:** anything you built that you are not confident in. Say so plainly. I would rather review a flagged PR than debug a confident one.

---

## Appendix: audit scores

Nine independent audits, one per surface.

| Surface | Score | The one-line read |
|---|---|---|
| Design system | 6/10 | Foundation is 7.5, execution is 3. Tokens are genuinely good. Nothing downstream was finished. |
| Chat experience | 6/10 | Server is rigorous. Client shipped on vibes. Stop is broken three different ways. |
| Activation funnel | 4/10 | Onboarding is the best part of the product. It ends in a wall the previous screen said would not be there. |
| Settings and toolkits | 6/10 | Backend is meticulously defensive. The UI lies by omission in ten places. |
| Voice / terminal / Telegram | 5 / 7 / 6 | Lifecycle cleanup is careful. Several user-facing promises are silently false. |
| State and error handling | 6/10 | Zero `.mutate()` violations, all `$queryRaw` Zod-validated. Query `error` is handled in 7 of ~30 call sites. |
| A11y and mobile | 5 / 6 | Radix does the hard parts correctly. The app is silent to screen readers and the iOS keyboard covers the composer. |
| Testing and CI | 0/10 | Zero tests, zero CI. But 0 typecheck errors and 0 lint errors: the baseline is clean. |
| Performance | 6/10 | Three specific landmines, each a few lines. Not systemic rot. |
