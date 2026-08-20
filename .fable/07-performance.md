# PR 07: Performance

Branch: `fable/07-performance`
Base: `fable/06-a11y-mobile`

## What changed

- **Cron sweeper indexes** (migration `20260714090000_cron_sweeper_and_memory_indexes`): partial index `(enabled, "nextRunAt") WHERE "lockedAt" IS NULL` matching the sweep's claim predicate, plus `("instanceId", category, "createdAt" DESC)` on memory for the per-turn bucket read (query shape verified against getBucketMemories). **Deviation:** the brief specified CONCURRENTLY, but Prisma Migrate wraps migrations in a transaction where CONCURRENTLY is a hard Postgres error; the cited HNSW migration's actual house pattern is plain CREATE INDEX IF NOT EXISTS. Documented in the migration file. Tables are small; the brief lock is fine.
- **Chat render cost:** `experimental_throttle: 50`; React.memo on AssistantMessage/UserMessage (callback props verified stable); the dep-free useLayoutEffect keyed properly (no more per-token forced layout); **windowed rendering** of the last 75 messages with an anchor-preserving "Show earlier messages (N)" button. This is the brief's sanctioned fallback: virtualization's dynamic-measurement + reverse-infinite-scroll + streaming-growth triangle could not be runtime-verified tonight, and correctness beats the checkbox. All four scroll behaviors preserved.
- **LiveKit code-split:** VoiceCall via `next/dynamic({ ssr: false })` behind a `hasEverCalled` latch; ~1.2MB+ off first dashboard load.
- **TerminalPane:** per-message entry cache keyed on parts identity; tokens only recompute the streaming message; TerminalLogEntry memoized.
- **Bundle diet:** react-virtuoso removed (imported by nothing); client moment → dayjs via `~/lib/dayjs` (relativeTime plugin), including `lib/cron-format.ts` which was leaking moment into client bundles; moment-timezone untouched server-side; CLAUDE.md Date & Time section rewritten.
- **Assets:** 12 unreferenced SVGs deleted (~17MB); rays_left.svg 605KB → 4.9KB (embedded PNG textures stripped, all vector rays kept); quarter_circle.svg (99% embedded PNG rendered at 0.07 opacity) replaced with a CSS repeating-radial-gradient. elements/ folder: 19MB → 12KB.
- **Settings split:** the seven heavy cards load via next/dynamic with their skeletons.
- **setup.ts:** instance fetch selects exactly the nine fields read (was dragging prompt blobs + three encrypted keys per turn).

## Deferred

- **HNSW verification** needs a live DB. Operator note in memory-search.ts with the exact EXPLAIN ANALYZE and the drop criterion. Index NOT dropped blind.
- True @tanstack/react-virtual virtualization: revisit with runtime verification available.

## Acceptance

- [x] react-virtuoso gone; moment absent from client code (grep-verified)
- [x] LiveKit dynamically imported
- [x] Message DOM bounded (windowed fallback, documented)
- [x] Migration follows the repo's real index-migration pattern
- [x] setup.ts uses select
- [x] pnpm typecheck + lint clean

Dependencies: +dayjs, -react-virtuoso.
