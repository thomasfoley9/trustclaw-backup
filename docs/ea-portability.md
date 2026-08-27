# EA portability: take it anywhere

The EA (Presence Mode) is deliberately composable. Nothing about it is tied to
a specific Composio account, Slack workspace, employer, or hosting account. It
is an assistant you chat with, and every integration it uses rides
configuration you can swap. This doc is the runbook for moving it.

## What the EA is made of

| Layer | Where it lives | Portable how |
|---|---|---|
| App code | github.com/thomasfoley9/trustclaw-backup | Deploy anywhere Next.js 15 runs (Vercel path is wired) |
| State (tasks, watches, memories, chat history) | Postgres (pgvector) via `DATABASE_URL` | Point at any Postgres; migrations auto-run on deploy |
| Tool access (Gmail, Calendar, Slack, Fireflies, SFDC, 500+ apps) | The per-instance Composio API key, set in Settings, encrypted at rest | Paste a different key; everything re-routes |
| Model | Per-instance Anthropic key (or owner-funded house models) | User-owned; set in Settings |
| SMS / phone | `TWILIO_*` env vars (your own Twilio account) | Deployment env, independent of Composio |
| Voice calls | LiveKit Cloud agent (`claw-voice/`, deployed via `lk agent deploy`) + `LIVEKIT_*` env | Your own LiveKit project, independent of Composio |
| Telegram | `TELEGRAM_*` env vars (your own bot) | Deployment env |

The one rule that makes this work: **every Composio call goes through
`getComposioForInstance()`**, which resolves the instance's own stored API key
first (the deployment-level `COMPOSIO_API_KEY` is only an optional owner-funded
fallback for keyless users). There are no hardcoded connection ids, workspace
ids, or account references in the EA code paths. Slack channel, owner-id gate,
and inbound cursor are discovered and stored per instance, and they reset
automatically when the key changes (see below).

## Moving the EA to a different Composio account

Example: leaving an employer whose Composio account backed your connections.

1. Create the new Composio account and grab its API key.
2. In the new account, connect the toolkits the EA uses: Gmail, Google
   Calendar, Slack (as YOU, a user connection - the EA posts in your voice),
   plus whatever else you rely on (Fireflies, Salesforce, ...).
3. In the app: Settings -> Composio API key -> paste the new key.
   Setting a different key automatically resets the EA's Slack binding
   (channel id, owner-id gate, inbound cursor) and turns Slack presence off,
   because those were captured through the old connection. This is fail-closed
   by design: a stale binding under a new connection would either dead-letter
   posts or gate inbound commands on the wrong Slack user.
4. Toolkits page: confirm the new connections show as connected.
5. Channels page: re-enable Slack. The EA finds-or-creates `#ea` through the
   new connection, posts a fresh welcome, and re-captures the owner gate and
   cursor from that verified post. Prior channel history is never replayed as
   commands.
6. SMS, phone, voice, and Telegram keep working untouched - they never
   depended on Composio.
7. Sanity check: type `what's due` in `#ea`.

Notes:
- Watches and tasks (EaWatch/EaTask) live in YOUR database and survive the
  swap. Gmail watches stay meaningful as long as the new Composio account
  connects the same mailbox.
- Approval semantics are unchanged: nothing external sends without per-message
  approval, whichever account backs the tools.

## Moving the deployment itself

1. Clone the repo, or point a new Vercel project at it. Production deploys
   also work via `vercel deploy --prod` with `VERCEL_ORG_ID` +
   `VERCEL_PROJECT_ID` set.
2. Set the env vars. Required: `DATABASE_URL` (Postgres + pgvector),
   `BETTER_AUTH_SECRET`, `CRON_SECRET`. Strongly recommended:
   `ENCRYPTION_KEY` (encrypts stored keys at rest). Feature-gated:
   `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` (SMS),
   `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `NEXT_PUBLIC_LIVEKIT_URL`
   (voice), `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` /
   `TELEGRAM_WEBHOOK_SECRET`, `REDIS_URL` (resumable streams + abort flags),
   house-model keys (`MOONSHOT_API_KEY` or `OPENROUTER_API_KEY`). See
   `.env.example` and `src/env.ts` for the full list.
3. Migrations run automatically on deploy (`vercel-build` runs
   `prisma migrate deploy` over the unpooled URL) - no local DB creds needed.
4. Crons come from `vercel.json` (sweeper, `/api/cron/ea` inbound reader,
   voice keepalive). On non-Vercel hosts, schedule those endpoints yourself
   with `CRON_SECRET` auth.
5. The voice agent deploys separately: `cd claw-voice && lk agent deploy`
   (needs the `lk` CLI authenticated to your LiveKit Cloud project).
6. Moving the DATA too (not just the app): dump and restore Postgres
   (`pg_dump` from the old `DATABASE_URL`, restore to the new one). Everything
   the EA knows - memories, tasks, watches, transcripts - is in that one
   database plus the encrypted keys, which decrypt only with the same
   `ENCRYPTION_KEY`. Keep that value with the data.
