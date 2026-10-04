# tests/api

Conventions for the API test tier. The tier boots a `wrangler dev` worker plus an in-process mock Twitch server on throwaway D1/KV ([ADR 0025](../../docs/decisions/0025-e2e-ui-tests-with-playwright-and-test-seam.md)); the root `AGENTS.md` "Tests" section covers how to run it.

## Where things live

- Mock Twitch handlers (`onStreams`, `onFollowedStreams`, `onPush`, ...) are methods on the orchestrator in `setup/orchestrator.ts`; `setup/mock-twitch-server.ts` is the in-process HTTP server they program. A new Twitch endpoint needs a handler in the orchestrator, not a new server.
- Test data goes in through the test seam: `tests/shared/seam-client.ts` calls `apps/api/src/http/routes/_tests.ts`, which only mounts when `environment !== "production"` (ADR 0025).

## Seeding a new field or record kind

- Symptom: the new field never shows up in the seeded row, or the test fails to compile in one file but not the other.
- Why it slips past local checks: the seed input types (`Seed*Input`) are declared in `_tests.ts` and re-exported by `seam-client.ts`, while the DB writes in the `/seed` handler, the cleanup in `/reset` and the reads in `/inspect` are all in `_tests.ts`, and the typed helpers (`seedPreferences`, ...) and `InspectResponse` record types are in `seam-client.ts`. The worker is a separate process, so a field missing from the handler is dropped silently.
- Verify: change both files, then run a test that seeds the field and reads it back through `inspect` (or the API response).
