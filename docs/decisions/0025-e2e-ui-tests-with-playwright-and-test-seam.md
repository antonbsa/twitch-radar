# 0025 - E2E UI Tests With Playwright And A Guarded Test-Seam Endpoint

## Status

Accepted

## Context

The in-process API tests under `tests/api` (see [ADR 0011](0011-keep-api-tests-under-root-tests-api.md)) call `worker.fetch(...)` directly against an in-memory D1/KV and never render the UI. T-004 added the Channels, Alerts, and Account views, which needed coverage that drives the real rendered app — including a genuinely authenticated user — rather than only asserting on API responses.

The Twitch OAuth redirect cannot be automated, so any such tier needs a way to reach an authenticated state without a real Twitch login, plus a way to guarantee and clean up test data against the same bindings the real routes use.

## Decision

- Use `vitest` as the test runner and the full `playwright` package (not `@playwright/test`) driven via `import { chromium }`, so browser control lives inside ordinary vitest tests instead of a second test runner.
- Add a test-seam endpoint in `apps/api` (`src/http/routes/_tests.ts`, `POST /api/__test__/reset` and `POST /api/__test__/seed`), registered on the router only when `environment !== "production"` (`src/index.ts` builds the app once per isolate, deciding route composition from the first request's env binding). No request-time token check exists because there is nothing to bypass: the route is absent entirely on a production deploy. Because it runs inside the worker, it writes through the same `Database`/`APP_CACHE` bindings the real routes use — no separate `wrangler` CLI or preview KV namespace.
- Reproduce the real OAuth callback's side effects (user upsert + `createSession`) from the seam instead of faking a session, then inject the resulting cookie into a Playwright `BrowserContext` via `addCookies`. Everything except the external Twitch redirect is real.
- The E2E run is self-contained: a `globalSetup` (`tests/web/e2e/setup/global-setup.ts`) applies D1 migrations, boots `wrangler dev` (`:8787`) and `vite dev` (`:5173`), polls both for readiness, and tears both down after — no manually-started dev servers required.
- `vitest.e2e.config.ts` runs this tier serially (`fileParallelism: false`): one shared app instance per run, so state changes from one spec don't race another's.
- E2E fixtures use a fixed user id (`usr_e2e`) and a fixed broadcaster id prefix (`e2e_bc_`) so `reset()` can scope its cleanup without a fixture registry; `channel_state` is monitored globally across users (see [ADR 0007](0007-monitor-broadcasters-globally-across-users.md)), so it's cleaned by that prefix rather than by user id.

## Consequences

- The seam is shared by both test tiers through `tests/shared/seam-client.ts`: the E2E tier resets with the default scoped mode (only `usr_e2e` rows and `e2e_bc_`-prefixed channel state, so manually-created dev data survives), while the API tier (`tests/api`, which runs real HTTP requests against its own worker with throwaway D1/KV state) uses `{ scope: "all" }` and can also seed arbitrary users with encrypted Twitch tokens.
- `npm run test:web` runs the whole web tier — the fast unit tests (`tests/web/unit`, no browser needed) and the Playwright specs — in one vitest run that boots and tears down the app itself; it requires `npx playwright install chromium` once per environment. `npm run test:api` is the same shape: a plain `vitest run` whose `globalSetup` (`tests/api/setup/global-setup.ts`) applies migrations, starts an in-process mock Twitch server, and boots its own `wrangler dev` against throwaway D1/KV state before any test file runs. `npm test` runs `test:api` and `test:web` concurrently (disjoint ports and DB state), failing if either tier fails; `npm run test:e2e` filters the web tier down to just the browser specs.
- Registering the test-seam routes conditionally is a runtime decision, not build-time dead-code elimination — the route handlers remain present in the worker bundle regardless of deploy target, they're just never added to the router when `environment === "production"`. There is currently no separate deployed "preview" environment reachable over the network; if one is introduced later, revisit whether environment-gating alone is still sufficient or a shared secret should come back.
- Preferences/category endpoints owned by T-006 don't exist yet; E2E happy-paths that depend on them are written as `it.skip` stubs with seeding already wired up (`seedPreferences`), so only the `.skip` needs removing once T-006 ships.
- Both tiers' `global-setup.ts` spawn their dev-server processes with captured (not inherited) stdio, so a healthy run prints only vitest's own output — no per-request `wrangler`/`vite` logs. A setup failure or an unexpected mid-run exit prints the captured output and fails the run immediately (`process.exit(1)`) instead of silently hanging or producing confusing per-test timeouts. The shared spawn/readiness/teardown plumbing behind this lives in `tests/shared/setup/process-lifecycle.ts`, used by both `tests/api/setup/global-setup.ts` and `tests/web/e2e/setup/global-setup.ts` so it isn't duplicated per tier.
- CI (`.github/workflows/tests.yaml`) runs `test:api` and `test:web` as separate GitHub Actions jobs rather than one `npm test` job, specifically so the Playwright browser install (only needed by the e2e tier) doesn't run for the API-only job.
