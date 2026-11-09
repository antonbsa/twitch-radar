# tests/api

Conventions for the API test tier. The tier boots a `wrangler dev` worker plus an in-process mock Twitch server on throwaway D1/KV ([ADR 0025](../../docs/decisions/0025-e2e-ui-tests-with-playwright-and-test-seam.md)); the root `AGENTS.md` "Tests" section covers how to run it.

## Where things live

- Mock Twitch handlers (`onStreams`, `onFollowedStreams`, `onPush`, ...) are methods on the orchestrator in `setup/orchestrator.ts`; `setup/mock-twitch-server.ts` is the in-process HTTP server they program. A new Twitch endpoint needs a handler in the orchestrator, not a new server.
- `setup/contract.ts` has `expectConforms` / `expectApiError`: they check status, content type and the whole body against a response contract from `apps/api/src/contracts/` (ADR 0067). Read a response body through them, not with an `as { ... }` cast, wherever the route has a contract.
- `contract-coverage.test.ts` imports `buildApp()` under Node and compares its routes with `ROUTE_CONTRACTS` (it enforces that every route is listed; a `{}` entry is an unchecked "no JSON body" declaration, and any `ALL`/`OPTIONS` route beyond the global middleware, the CORS preflight and the per-router auth guards fails it) (`apps/api/src/contracts/registry.ts`); it never calls the worker (the tier's `globalSetup` still boots one). It sets `__NON_PRODUCTION_FEATURES__` to `false` itself, so a new import of that constant in `app.ts`'s graph is covered, but a Workers-only global used at import time would make it fail to load.
- Test data goes in through the test seam: `tests/shared/seam-client.ts` calls `apps/api/src/http/test-seam/{seed,reset,inspect}.ts`, which are compiled out of production builds (ADR 0045).

## Seeding a new field or record kind

- Symptom: the new field never shows up in the seeded row, or the test fails to compile in one file but not the other.
- Why it slips past local checks: the seed input types (`Seed*Input`) are declared in `test-seam/seed.ts` and re-exported by `seam-client.ts`, while the DB writes in `test-seam/seed.ts`, the cleanup in `reset.ts` and the reads in `inspect.ts`, and the typed helpers (`seedPreferences`, ...) and `InspectResponse` record types are in `seam-client.ts`. The worker is a separate process, so a field missing from the handler is dropped silently.
- Verify: change both files, then run a test that seeds the field and reads it back through `inspect` (or the API response).

## In-process D1 tests

- Default to HTTP against the worker through the test seam. Reach for an in-process D1 (`getPlatformProxy` from `wrangler`, migrated by `applyLocalMigrations` in `tests/shared/setup/process-lifecycle.ts`) only for timing between a module's own steps that HTTP can't trigger, such as an Event landing between `applySnapshot`'s read and `commit`. Example: `channel-state-race.test.ts`.
- Symptom: the test passes while the deployed worker behaves differently. Why it slips: it imports `apps/api/src` directly, so the worker's env parsing and bindings wiring never run. Verify anything beyond the module's own logic through the HTTP tier.
- Symptom: the proxy sees no tables. Why: `wrangler --persist-to <dir>` writes under `<dir>/v3`, while the proxy's `persist.path` is that `v3` root. Keep the table-list assertion in `beforeAll`.
