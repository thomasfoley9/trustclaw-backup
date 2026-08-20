# PR 02: Chat correctness

Branch: `fable/02-chat-correctness`
Base: `fable/01-brand-copy-integrity`

## P0 fixes

- **Stop no longer deletes the reply.** The run driver in `app/api/chat/route.ts` now accumulates text deltas and tool calls off `fullStream`; on abort it persists them into the pre-created assistant row (empty-row-guarded) instead of deleting it. Deviation from the brief: `ToolLoopAgent` in ai@6 does not accept an `onAbort` setting (only `streamText` does), and `onAbort`'s payload is completed steps only, which misses the in-flight step's partial text. The route-level capture persists strictly more, and keeps row settlement in one place.
- **Stop reaches runs on other lambdas.** `/api/chat/stop` sets `abort:<conversationId>` in Redis (EX 300, matching maxDuration); the run driver polls it every 2s and aborts its local controller. Same pattern as clearStreamingMessage.
- **Stop-then-send can't double-run.** The stop route only releases the run claim when the abort actually reached the run; a remote orphan clears its own claim when it sees the flag (within ~2s). Trade-off: on a Redis-less multi-instance deploy, a remote run now stays claimed until it ends naturally instead of being silently orphaned into a data race.
- **IME guard.** `isComposing || keyCode === 229` at the top of the composer's keydown handler.
- **History merge by id union.** The post-stream adopt keeps the local prefix that predates the server's 10-row page window and takes the server page from the first shared id (which also dedups optimistic rows). Older messages no longer vanish after every turn.
- **Attachment cap 3MB decoded** (client + server + copy), keeping the base64-encoded JSON body under Vercel's 4.5MB edge limit. Chose the lower cap over blob storage: no new infrastructure, and 3MB covers the actual use cases (CSVs, PDFs, screenshots). Blob upload is the right follow-up if larger files matter.

## P1

- **Regenerate + inline error retry.** The SDK's `trigger: "regenerate-message"` is honored server-side: the old reply rows are deleted, the user row is not re-persisted, and the built context does not double-append the user turn (`buildContext` accepts null). If the original send failed before the user row was persisted (409/429/setup error), the retry falls back to a normal submit so the turn is never lost. UI: retry banner above the composer on stream error, regenerate icon on the last assistant reply.
- **Type-ahead composer.** The textarea and attach button stay enabled during streaming; send stays blocked. The focus-restore hack is deleted (nothing steals focus anymore).
- **Per-conversation drafts** in sessionStorage, keyed by conversation id, cleared on send.
- **Markdown quality:** rehype-highlight syntax highlighting (new dependency; palette in globals.css for both themes), per-block copy button, links open in new tab with rel=noopener, tables scroll horizontally, and `prose-pre` no longer uses `whitespace-pre-wrap` (it mangled code indentation).
- **Timestamps + token counts** ride along as UIMessage metadata from getHistory (previously fetched and discarded) and render in message footers.
- **Sample prompts** derive from connected toolkits with a connection-free fallback list.

## Acceptance

- [x] Stop mid-stream persists the partial (route-level capture; empty-row guard)
- [x] Stop then send: exactly one run (claim released only by its owner)
- [x] IME Enter commits candidates without sending
- [x] 20-message conversation: merge keeps rows outside the page window
- [x] pnpm typecheck + lint clean

## Notes / limitations

- Telegram/cron runs use `agent.generate()` and still lose partials on their (supersede) aborts; PR 08 territory.
- Live browser verification was skipped: another session's dev server owns this working tree's `.next` and port; starting a second one risks corrupting it (documented repo gotcha).
