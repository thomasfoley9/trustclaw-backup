# PR 04: Settings integrity

Branch: `fable/04-settings-integrity`
Base: `fable/03-activation-path`

## What changed

- **Error != empty everywhere.** All ten named settings surfaces plus model-settings, model-picker, save-to-knowledge-dialog, and the toolkit card path now render an error state with retry (ErrorDisplay or a compact inline variant per surface) instead of masquerading as empty. Self-hiding chat-header controls (voice picker, personality control) were deliberately left: they render nothing on error rather than lying, and have no room for an error panel.
- **Confirms:** memory delete and MCP server removal are wrapped in AlertDialog like every other delete.
- **Timezone UI:** new `timezone-settings.tsx` card (IANA list via `Intl.supportedValuesOf("timeZone")` with fallback, device-zone shortcut), persisting through the existing `updateSettings.timezone`; no schema change was needed (the column, mutation, and reads all existed). Cron rows show the zone next to their next run; new jobs default to the user zone.
- **Toolkit disconnect:** `toolkits.disconnect` lists this user's Composio connected accounts for the slug and deletes each (revokes the grant platform-side); UI is an Unplug button behind an AlertDialog. noAuth toolkits get no disconnect (no account to delete).
- **Custom-model keys validated upstream** before storing: OpenAI-compatible via GET /models, Anthropic via x-api-key, Google via x-goog-api-key (400 treated as rejection), OpenRouter via /api/v1/key. 8s timeout; UNAUTHORIZED on 401/403. There is no separate updateCustomModel: adds are an upsert, so this covers updates.
- **cron-format fork deleted**; the settings card imports `~/lib/cron-format` (gets the isPlain guard back).
- **react-hook-form migration** for knowledge-buckets, personalities, skills (useFieldArray for required inputs; empty rows pruned pre-validation), skill-creator, custom-models, mcp-servers, all importing the procedures' .schema.ts.
- **Cron toggle** gets `disabled={isPending}` (the optimistic rollback pattern is only safe for one in-flight call).
- **Connect flow unified** on popup+poll via new `use-toolkit-connect.ts` (synchronous about:blank open to beat popup blockers, link caching, 5s status poll). Onboarding keeps its own flow: it polls a richer payload (keyMissing handling) and merging them would fork one hook internally.
- **Danger zone** enumerates the true cascade: conversations/messages, memories, knowledge buckets, scheduled tasks, personalities, skills, custom models + stored keys, MCP servers, generated images, settings.

## Acceptance

- [x] Network killed: every settings card shows a true error state with retry
- [x] Memory/MCP deletes confirm first
- [x] Timezone settable; cron next-run shows its zone
- [x] Connected toolkits disconnect behind a confirm
- [x] pnpm typecheck + lint clean

## Notes

- Dependencies added: none.
- No live-backend verification (dev server owned by another session); validated by types, lint, and pattern-matching the proven flows.
