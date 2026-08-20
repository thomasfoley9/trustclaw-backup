# Test infrastructure notes

## Layout

- Unit/component tests are co-located: `src/**/<name>.test.ts(x)`, run by
  vitest (`pnpm test` / `pnpm test:watch`). Node environment by default;
  component tests opt into jsdom with a `// @vitest-environment jsdom`
  docblock.
- `tests/setup.ts` registers jest-dom matchers and a `window.matchMedia` stub.
- `tests/stubs/server-only.ts` replaces the `server-only` poison pill
  (aliased in `vitest.config.ts`).
- E2E lives in `e2e/` and is deliberately excluded from `pnpm test`; run it
  with `pnpm test:e2e` (needs a database and .env, see `e2e/first-chat.spec.ts`).

## Environment

`src/env.ts` (t3-env) validates required server vars at import time. Vitest
sets `SKIP_ENV_VALIDATION=1` (see `vitest.config.ts`), which t3-env honours
whenever `NODE_ENV !== "production"`.

## Writing tRPC integration tests (future work)

- `createCaller = createCallerFactory(appRouter)` is exported from
  `src/server/api/root.ts`. Build a caller with a fake context:

  ```ts
  const caller = createCaller({ headers: new Headers(), session: fakeSession });
  ```

- `createTRPCContext` produces only `{ headers, session }`. There is NO
  `ctx.prisma`: procedures import the `db` singleton directly from
  `~/server/clients/db`, so database access is mocked with
  `vi.mock("~/server/clients/db")` (the module creates a pg Pool at import
  time, so the mock also prevents any connection attempt).

- Deterministic streaming: `vi.mock` the model resolver
  (`agent/resolve-model.ts`) to return `MockLanguageModelV3` from `ai/test`
  (the AI SDK v6 mock; older docs call it `MockLanguageModelV2`).
  That exercises the real ToolLoopAgent loop and the `onFinish` persistence
  path without calling Anthropic.

- Real-database tier: `docker-compose.yml` already provides
  `pgvector/pgvector:pg16` (port 5433) and `redis:7-alpine` for integration
  tests that want actual Postgres/Redis instead of mocks.
