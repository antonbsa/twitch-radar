# 0025 - E2E UI Tests With Playwright And A Guarded Test-Seam Endpoint

## Status

Accepted

## Context

The in-process API tests under `tests/api` (see [ADR 0011](0011-keep-api-tests-under-root-tests-api.md)) call `worker.fetch(...)` directly against an in-memory D1/KV and never render the UI. T-004 added the Channels, Alerts, and Account views, which needed coverage that drives the real rendered app — including a genuinely authenticated user — rather than only asserting on API responses.

The Twitch OAuth redirect cannot be automated, so any such tier needs a way to reach an authenticated state without a real Twitch login, plus a way to guarantee and clean up test data against the same bindings the real routes use.

## Decision

- Use `vitest` as the test runner and the full `playwright` package (not `@playwright/test`) driven via `import { chromium }`, so browser control lives inside ordinary vitest tests instead of a second test runner.
- Add a guarded test-seam endpoint in `apps/api` (`src/http/routes/__test__.ts`, `POST /api/__test__/reset` and `POST /api/__test__/seed`), mounted unconditionally in the router but rejecting every request with a 404 unless `environment !== "production"` and a `x-test-seed-token` header matches `TEST_SEED_TOKEN`. Because it runs inside the worker, it writes through the same `Database`/`APP_CACHE` bindings the real routes use — no separate `wrangler` CLI or preview KV namespace.
- Reproduce the real OAuth callback's side effects (user upsert + `createSession`) from the seam instead of faking a session, then inject the resulting cookie into a Playwright `BrowserContext` via `addCookies`. Everything except the external Twitch redirect is real.
- The E2E run is self-contained: a `globalSetup` (`tests/web/e2e/setup/global-setup.ts`) applies D1 migrations, boots `wrangler dev` (`:8787`) and `vite dev` (`:5173`), polls both for readiness, and tears both down after — no manually-started dev servers required.
- `vitest.e2e.config.ts` runs this tier serially (`fileParallelism: false`): one shared app instance per run, so state changes from one spec don't race another's.
- E2E fixtures use a fixed user id (`usr_e2e`) and a fixed broadcaster id prefix (`e2e_bc_`) so `reset()` can scope its cleanup without a fixture registry; `channel_state` is monitored globally across users (see [ADR 0007](0007-monitor-broadcasters-globally-across-users.md)), so it's cleaned by that prefix rather than by user id.

## Consequences

- The seam is shared by both test tiers through `tests/shared/seam-client.ts`: the E2E tier resets with the default scoped mode (only `usr_e2e` rows and `e2e_bc_`-prefixed channel state, so manually-created dev data survives), while the API tier (`tests/api`, which runs real HTTP requests against its own worker with throwaway D1/KV state) uses `{ scope: "all" }` and can also seed arbitrary users with encrypted Twitch tokens.
- `npm run test:web` runs the whole web tier — the fast unit tests (`tests/web/unit`, no browser needed) and the Playwright specs — in one vitest run that boots and tears down the app itself; it requires `npx playwright install chromium` once per environment. `npm test` runs `test:api` and `test:web` concurrently (disjoint ports and DB state), failing if either tier fails; `npm run test:e2e` filters the web tier down to just the browser specs.
- The test-seam guard is a runtime check, not build-time dead-code elimination — it is unreachable in production (wrong environment, and `TEST_SEED_TOKEN` is unset there), but the route handlers remain present in the worker bundle regardless of deploy target.
- Preferences/category endpoints owned by T-006 don't exist yet; E2E happy-paths that depend on them are written as `it.skip` stubs with seeding already wired up (`seedPreferences`), so only the `.skip` needs removing once T-006 ships.
