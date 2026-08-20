# PR 09: Testing and CI foundation

Branch: `fable/09-testing-ci`
Base: `fable/08-voice-terminal-telegram`

## What landed

- **Vitest** (`vitest.config.ts`): manual `~` → `./src` alias, node env default with jsdom per-file, `SKIP_ENV_VALIDATION=1`, `server-only` stubbed, e2e/ excluded. Gotcha solved: vitest 4 uses oxc which honors tsconfig's `jsx: "preserve"`; fixed with an explicit automatic-runtime jsx setting.
- **147 tests across 11 suites, ~1.2s, deterministic** (re-verified under two TZs):
  - crypto: roundtrip, key formats, dev passthrough, production fail-closed, wrong-key GCM failure, `isEncrypted` migration guard
  - context-pruning: 30% soft-trim head/tail, 50% hard-clear, protected last-3-assistant-turns, input immutability
  - error-parser: every branch (this is the text stuck users read)
  - token-estimation, strip-tool-echoes (exhaustive), cron-format (`*/15`, `1-5`, `0,30` fall back raw), username, telegram-webhook schema vs junk input
  - createCustomTools: incognito drops both memory tools; schedule always present
  - system-prompt: four frozen-clock file snapshots (default/incognito/persona/summary) + explicit incognito assertions
  - chat-input RTL (14 tests): trimmed send, Shift+Enter, IME guards (isComposing + keyCode 229), type-ahead while streaming, stop, too-long cap, sessionStorage drafts
- **CI** (`.github/workflows/ci.yml`): `checks` (lint + typecheck) and `test` (vitest) jobs, pnpm-cached, Node 22, on push-to-main + PR. Playwright job deliberately omitted with a commented enablement stub (no verified baseline tonight).
- **Playwright**: config + `e2e/first-chat.spec.ts` (signup → onboarding with free model → first chat with POST /api/chat mocked at the exact AI SDK v6 wire format read from the installed package). **Authored, not executed**: running it needs a dev server this session couldn't start. Excluded from `pnpm test`; runs via `pnpm test:e2e`.
- **tests/README.md**: tRPC harness facts: `createCaller` from root.ts, ctx is `{ headers, session }` only so mock `~/server/clients/db`; `MockLanguageModelV3` from `ai/test` (v6 ships V3, not the V2 the audit named) drives the real agent loop; docker-compose already carries the pgvector+redis integration tier.

## Dependencies (dev)

vitest (runner), jsdom (component env), @testing-library/react + user-event + jest-dom (RTL). Coverage package skipped (unused).

## Found while testing

- `estimateMessageTokens` counts array-form user content by part count rather than text length (the pruner has the fixed version; token-estimation does not). Tested the string path; did not encode the quirk as intended behavior. Follow-up candidate.

## Acceptance

- [x] pnpm test green: 11 files, 147 tests
- [x] pnpm typecheck + lint clean (no rule loosening)
