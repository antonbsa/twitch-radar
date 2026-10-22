# Testing Strategy

What is tested, at which level, and the seams that make a webhook-and-queue system testable. Part of the [architecture overview](overview.md).

## Tiers

The API and web e2e tiers are plain `vitest` runs whose global setup boots everything the tests need, tears it down, and prints the captured server output if setup fails ([ADR 0025](../decisions/0025-e2e-ui-tests-with-playwright-and-test-seam.md)). Neither needs a manually started server. Web unit tests are a third, setup-free tier that runs before the e2e one ([ADR 0064](../decisions/0064-web-unit-tests-as-their-own-tier.md)).

| Tier | Drives | Runs against |
| --- | --- | --- |
| API | Real HTTP requests to the Worker, plus a mock Twitch server in the test process | A real local Worker with throwaway D1 and KV ([ADR 0011](../decisions/0011-keep-api-tests-under-root-tests-api.md)) |
| Web unit | Pure functions and parsers | Nothing, no servers |
| Web e2e | A real browser (Playwright, driven from ordinary vitest tests) loading the app | The local Worker and the Vite dev server |

The API tier is where the system's behavior is covered: webhook verification, event processing, matching, delivery, scheduled jobs and every route. Because the Worker is the real thing, so are the queues and the cron: queue consumers run for real, and a scheduled job is triggered by simulating its minute through the local runtime ([ADR 0057](../decisions/0057-single-minutely-cron-trigger.md)). Twitch and the push services are the only fakes, as an HTTP server the Worker is pointed at.

The web tier covers what a browser does: rendering, navigation, forms. It is serial, since the specs share one running app instance, and retried once on CI only, to absorb browser timing flakes; a test that needs its retry repeatedly is treated as a bug.

## Seams

Two things make sign-in and external systems testable without weakening them:

- **A test seam in the Worker.** Routes that reset data, seed fixed users and reproduce the OAuth callback's real side effects (creating a user and a real session), so a browser test starts authenticated with a real cookie. Everything except Twitch's own redirect is real ([ADR 0025](../decisions/0025-e2e-ui-tests-with-playwright-and-test-seam.md)).
- **Real crypto, throwaway keys.** The push path is exercised end to end with real VAPID keys generated per run and valid subscription keys. The mock verifies delivery mechanics; whether a real push service can decrypt the payload is confirmed by hand on devices ([ADR 0035](../decisions/0035-web-push-via-webcrypto.md)).

Test and sandbox code is compiled out of the production bundle by a build-time constant, not gated at request time, so there is nothing in production to bypass. A check on the built bundle verifies it ([ADR 0045](../decisions/0045-build-time-exclusion-of-non-production-test-code.md)).

## The Sandbox

For manual and agent testing, dev and preview also expose a sandbox: fixed fictional personas anyone can sign in as without a Twitch account, a fake Twitch API inside the Worker, and an endpoint to inject a go-live or category-switch event into the real processing path ([ADR 0046](../decisions/0046-sandbox-personas-for-dev-and-preview.md)). It is safe to expose without a credential because a persona login can only produce one of a few predetermined identities. It is for exploring the app, not a third test tier: one smoke test keeps it from breaking silently.

## What Tests Can't See

Passing both tiers says little about an installed iOS PWA. Push permission, notification display and tap handling behave differently there, so they are verified by hand on a phone through the development tunnel ([development](../development.md)). A feature that depends on a platform API isn't done until it has worked on iOS.

## Static Checks

CI also runs checks that tests wouldn't catch: lint and formatting, typecheck, a check that all language catalogs have the same keys, migration consistency, and the production-bundle check ([deploy and release](deploy-and-release.md)).

Failed CI test runs publish a report (test output, server logs, traces and screenshots) to a separate reports repository and link it from the pull request, so a CI failure can be read without reproducing it ([ADR 0060](../decisions/0060-publish-failed-ci-test-reports-to-a-pages-repo.md)).
