# T-004 Tests: UI Views E2E Coverage

## Goal

Add an automated test tier that validates the T-004 UI Views (Channels, Alerts, Account) by driving the **real application** — the API worker and the web app — in a headless browser, with a genuinely authenticated user whose state is guaranteed before each run and cleaned up after.

This is a new, separate tier from the existing in-process API tests (`tests/api/**`, see [ADR 0011](../../../docs/decisions/0011-keep-api-tests-under-root-tests-api.md)). Those call `worker.fetch(...)` directly against an in-memory D1/KV; this tier boots the actual servers and exercises the rendered UI end to end.

## Confirmed Decisions

- **Runner + driver:** `vitest` as the runner, `playwright` (full package, manages its own pinned Chromium) driven from inside vitest via `import { chromium }`. Not the `@playwright/test` runner.
- **State orchestration:** a **guarded test-seam endpoint** in `apps/api`, mounted only when `environment !== "production"` and a secret header matches. The orchestrator calls it over HTTP. Because it runs inside the worker, it writes to the same `DB` / `APP_CACHE` bindings the real routes read — no `wrangler` CLI, no `--preview` KV namespace ambiguity, identical locally and in CI.
- **App lifecycle:** tests boot and tear down the app themselves (`globalSetup` starts `wrangler dev` + `vite dev`, polls readiness, stops them after). The run is self-contained — one command runs everything.
- **Authentication model:** a real user row in the real local D1 plus a real session key in real KV. Only the external Twitch OAuth redirect (non-automatable) is bypassed; the orchestrator reproduces exactly what the callback produces, then injects the real session cookie via `context.addCookies`.

## Spec Work

Define or confirm:

- Test-seam contract: `POST /api/__test__/reset` and `POST /api/__test__/seed` request/response shapes; the guard (env + `x-test-seed-token`).
- E2E user identity (fixed `usr_e2e` id) and the reset blast radius across tables.
- Server ports and readiness probes for `globalSetup` (API `:8787`, web `:5173`).
- Viewport for the mobile-first assertions (390×844).
- Determinism strategy for live-duration assertions (seed `started_at` relative to now; assert the `Xh Ym` pattern in-browser, assert exact values in unit tests with fake timers).
- Which happy-paths are gated on T-006 and therefore land as `.skip`.

## Implementation Scope

### 1. Dependencies & configuration

- Add `playwright` as a dev dependency; document `npx playwright install chromium` as the CI browser-provisioning step.
- `vitest.e2e.config.ts` at the repo root: `globalSetup` (below), `fileParallelism: false` (serial — one shared app instance, no state races), `testTimeout` ~30s, env loaded from the existing `.env.development` + `.env.local` loader.
- Root scripts: `test:web` (fast unit tier, added to the default `test` chain) and `test:e2e` (heavier, opt-in; its own CI stage).

### 2. Test-seam endpoint (`apps/api`)

- `src/http/routes/__test__.ts`:
  - `POST /reset` — delete the E2E user's rows across all tables + its KV session keys.
  - `POST /seed` — body describes user / followed channels / channel state / preferences; create them via the repositories; return `{ userId, sessionId, cookie }`.
- Mount behind a single guard in `src/index.ts`: only registered when `config.environment !== "production"` and `x-test-seed-token` matches`TEST_SEED_TOKEN`.
- Add `TEST_SEED_TOKEN` to the env schema (`src/env.ts`, optional/dev-only) and to `.env.development`.

### 3. Orchestrator (`tests/web/e2e/orchestrator/`)

HTTP wrappers around the test seam that guarantee and clean state:

- `resetState()` — called `beforeAll`/`afterAll` per spec file. - `seedAuthenticatedUser()` → `{ userId, cookie }`.
- `seedFollowedChannels(userId, [...])`, `seedChannelState([...])`, `seedPreferences(...)` (the last for when T-006 lands).

### 4. Harness (`tests/web/e2e/setup/`)

- `global-setup.ts` — run `db:setup`, boot `wrangler dev` + `vite dev`, poll both ports until healthy, tear both down on teardown.
- `browser.ts` — launch Chromium, 390×844 context, cookie-injection helper.

### 5. Unit tier (`tests/web/unit/`)

- `format.test.ts` — pure-function coverage for `lib/format.ts` (`42K` / `1.2M` / `1h 23m` / `Ym` under an hour) using fake timers for the `Date.now()`-based duration. Locks the formatting ACs deterministically without a browser.

### 6. E2E specs (`tests/web/e2e/`)

- `auth-gate.spec.ts` — no cookie → `/login`, tab bar absent; seeded cookie → `/channels`.
- `channels.spec.ts` — ordering (live by viewer desc, offline by name asc), row content (live dot, category, formatted viewers, `Xh Ym`), loading skeleton, empty state, error state, sync button in-flight disable + refetch, config opens sheet.
- `alerts.spec.ts` — empty state text; **error state asserted to appear within ~2s** (regression guard for the 4xx-no-retry fix in `main.tsx`); add-category sheet opens + tap-outside dismiss.
- `account.spec.ts` — identity from `/me`; notification permission rendered for `granted` / `default` / `denied`; logout → `/login` + cleared context; mid-session 401 (orchestrator revokes session, then click Sync) → "Reconnect Twitch" appears and URL stays `/account`.

### Gated on T-006

The preferences/categories backend (`/api/preferences*`, `/api/categories/search`) does not exist yet — T-006 owns it and depends on T-004. Until it ships, the category-search-returns-results and preference add/remove happy-paths land as `.skip` stubs (with the seed orchestrator ready), rather than being faked. Today those paths are covered only at the empty/error level.

## Acceptance Criteria

- `npm run test:e2e` boots the real app, runs all specs green, and tears the app down cleanly.
- The E2E user's state is created before each spec file and fully removed after — no residue in local D1/KV between runs.
- The test-seam endpoint is provably unreachable when `environment === "production"`.
- Unit tier (`npm run test:web`) covers viewer-count and live-duration formatting deterministically.
- Specs assert against the rendered UI, not just API responses.
- Mobile-viewport assertions run at 390×844.
- The Alerts error state is asserted to surface fast (guards the retry fix).
- T-006-gated happy-paths are present as `.skip` with seeding in place.

## Completion Validation

- Full E2E run is green locally from a clean checkout after `db:setup` + `npx playwright install chromium`.
- Re-running the suite twice in a row passes (confirms reset/cleanup is idempotent).
- Grepping the built worker confirms the test seam is absent under production env.
- Unit tier passes under fake timers with no reliance on wall-clock time.

## Dependencies

- T-004 UI Views (implementation under test).
- T-002 Twitch Auth And Sync (session/user primitives the seam reuses).
- T-006 Preferences And Monitoring (unblocks the currently-skipped happy-paths).
