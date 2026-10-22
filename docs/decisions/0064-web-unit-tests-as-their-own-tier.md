# 0064 - Web Unit Tests As Their Own Tier

## Status

Accepted. Amends [ADR 0025](0025-e2e-ui-tests-with-playwright-and-test-seam.md): web unit tests no longer run inside the e2e vitest run.

## Context

[ADR 0025](0025-e2e-ui-tests-with-playwright-and-test-seam.md) ran `tests/web/unit` and the Playwright specs "in one vitest run" through `vitest.e2e.config.ts`. That config's `globalSetup` boots `wrangler dev` and `vite dev`, so running a single pure-function test paid the full server boot, contended for the e2e ports, and inherited the browser-sized `fileParallelism: false` and `testTimeout: 30_000`.

## Decision

- **`tests/web/unit` is its own tier** with `vitest.unit.config.ts`: no `globalSetup`, default parallelism and timeouts, the same reporters as the other tiers, and an html report at `test-results/unit/report/index.html`. It aliases `@` to `apps/web/src`, as the web app's Vite config does.
- **`vitest.e2e.config.ts` includes only `tests/web/e2e`.**
- **Scripts:** `npm run test:unit` and `npm run test:e2e` each run one tier; `npm run test:web` chains unit then e2e, so `npm test` and the CI e2e job are unchanged and a unit failure stops the run before the app boots.

## Consequences

- A unit test runs in seconds with no servers, and no longer collides with another session's e2e ports.
- CI still runs unit tests inside the E2E job and uploads `test-results/` as the `test-report-e2e` artifact, so the unit report publishes with it (ADR 0060); the report index lists it as its own "Web unit tests" section.
- The rest of ADR 0025 (Playwright from vitest, the guarded test seam, the API tier's process model) is unchanged.
