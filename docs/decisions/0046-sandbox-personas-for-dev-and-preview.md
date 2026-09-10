# 0046 - Sandbox Personas For Twitch-Free Dev And Preview Access

## Status

Accepted

## Context

Testing the app manually, or driving it with a browser-automation agent, currently requires a real Twitch OAuth login — the only way to reach an authenticated state outside the automated test tiers. This blocks two things: quick manual verification without a real account in hand, and any agent that cannot complete a real OAuth redirect (it isn't a Twitch account holder and can't authorize one).

The existing test seam ([ADR 0025](0025-e2e-ui-tests-with-playwright-and-test-seam.md)) already solves an adjacent problem — forging an authenticated session for the automated E2E tier — but it is the wrong tool for this: it accepts an arbitrary `userId` and seed payload, is meant for scripted setup/teardown between test runs, and its `usr_e2e` / `e2e_bc_`-prefixed state is deliberately wiped by the E2E tier's `reset()` between runs. Reusing that identity or that endpoint for interactive/manual/agent use would mean a test run and a manual session can stomp on each other's state.

## Glossary

- **Sandbox** — the mode, available in dev and preview (never production, see [ADR 0045](0045-build-time-exclusion-of-non-production-test-code.md)), in which the app is usable without a real Twitch account. Distinct from "demo," which implies showing the product to a third party, and from "fake," which describes an implementation detail rather than the concept.
- **Persona** — one fictional identity within the sandbox, backed by a committed fixture file. A closed enum, not arbitrary input: `full` (rich data — multiple follows, some live, some preferences set), `empty` (freshly "logged in," zero follows), `reconnect` (a Twitch token in the already-invalid state `GET /me`'s `twitch_reconnect_required` reports).
- **E2E user** (`usr_e2e` / `e2e_bc_*` prefix, [ADR 0025](0025-e2e-ui-tests-with-playwright-and-test-seam.md)) — the automated test tier's disposable identity. Not a persona: different id space, different reset scope, so running the E2E suite never touches sandbox state and vice versa.
- **Test seam** (`/api/__test__/*`) — the existing arbitrary-payload endpoint used by both automated test tiers. The sandbox login is a separate, narrower endpoint; see Decision below for why they aren't merged.

## Decision

- **Login surface**: `POST /api/__sandbox__/login { persona }`, where `persona` is one of the closed enum values above — no credential, no free-form `userId` or session-forging payload. This is deliberately less powerful than the test seam: a persona login can only ever produce one of three predetermined identities from committed fixtures, never an arbitrary session. That's what makes it safe to expose with no request-time secret, unlike the seam.
- **Discovery surface**: a dedicated `/sandbox` route in the web app (not the login screen itself) with a button per persona, plus (per [issue tracking Phase C](#) — live-event injection) the controls for forcing a channel live/category-switch. A discreet link from the auth-gate screen points here. This keeps the real login path uncluttered and gives Phase C's controls a home. A browser-automation agent reaches an authenticated state purely by navigating and clicking — no token to acquire or pass in a URL.
- **Data model**: each persona's fixture (`infra/fixtures/sandbox/<persona>.json` or similar) is the source of truth for that persona's _Twitch-side_ state (their followed channels, as Twitch would report them) — not merely a duplicate of what gets seeded into D1. The E2E `full` persona's D1 rows are seeded as a **subset** of its fixture, so "Sync follows" has real, visible work to do (new follows not yet known to the Radar) instead of being a no-op against already-identical data. This mirrors the actual domain distinction the sync feature exists to resolve: what Twitch knows vs. what the Radar has already learned.
- **Fake Twitch Helix**: implemented in-worker (`/api/__sandbox__/helix/*` or equivalent), with `TWITCH_API_BASE_URL` pointed at the app's own `PUBLIC_URL` when the sandbox is active, rather than as a separate Node process. This works identically in dev and deployed preview, and follows the same "test-only code lives in the worker, gated out of production" shape the test seam already established (now via build-time exclusion, ADR 0045), rather than introducing a second pattern.
- **Live-event injection**: `POST /api/__sandbox__/events`, entering the same internal processing path as the real webhook handler but skipping HMAC verification (there is no secret to verify against for a sandbox-forged event). The existing `infra/scripts/dev/mock-eventsub.mjs` is kept as-is — it exists specifically to exercise the real HMAC verification path ([ADR 0032](0032-eventsub-webhook-verification-and-queueing.md)), which the sandbox route cannot do without either exposing `EVENTSUB_WEBHOOK_SECRET` to the caller or skipping the thing it's meant to test. Having both is deliberate: they exercise different halves of the same pipeline.
- **Reachability**: dev and preview only, never production — enforced by build-time exclusion ([ADR 0045](0045-build-time-exclusion-of-non-production-test-code.md)), not a request-time credential. The sandbox's own safety property is that persona login can only produce one of three fixed, non-sensitive identities; it does not need the same protection as the test seam's arbitrary-payload surface, so it deliberately does not sit behind the same (or any) shared-secret check.
- **Testing**: one thin E2E smoke test — log in via a persona and assert the app renders authenticated. The sandbox is dev/test tooling, not a feature with its own test suite; a smoke test catches the failure mode that matters (silent breakage discovered mid-unrelated-task) without testing the test double itself.

## Rejected alternatives

- **Reuse the E2E user/test seam identity for sandbox login.** Rejected — conflates two different lifecycles (disposable automated-test state vs. a stable identity for manual/agent inspection); running the E2E suite would wipe whatever the sandbox session had going.
- **Gate sandbox login behind a shared token (query param, header, or paired-once via `localStorage`).** Rejected for the login surface specifically: a query-string token leaks into logs/history and defeats "an agent navigates and clicks"; a paired-once token defeats the same goal for a clean agent session. The persona enum's narrowness is the actual safety property here, not a secret.
- **Run the fake Twitch Helix as a separate local Node process (mirroring `tests/api/setup/mock-twitch-server.ts`).** Rejected — preview has no place to host a separate process; an in-worker implementation is the only option that works identically in both dev and deployed preview.
- **Have the fake Helix read directly from whatever is seeded in D1.** Rejected — collapses the Twitch-side/Radar-side distinction the sync feature exists to resolve, making "Sync follows" a no-op in the one environment meant to demonstrate it working.
- **Create `CONTEXT.md` for this glossary.** Rejected — the project already has two documentation conventions (ADRs, TNs per [ADR 0039](0039-adopt-technical-notes-for-non-decision-research.md)) with established policy; a four-term glossary doesn't justify a third convention needing its own upkeep. It lives here instead.

## Consequences

- Three follow-on GitHub issues implement this incrementally (persona login + `/sandbox` UI; in-worker fake Helix; live-event injection). The first alone already resolves the original problem (usable app state without a real Twitch account); the other two add fidelity.
- `infra/fixtures/sandbox/` becomes a new committed directory; its fixtures are product-adjacent test data, reviewed like code.
- The auth-gate screen gains a discreet link to `/sandbox`, visible only when the sandbox is reachable (i.e., never in production, per build-time exclusion).
- `mock-eventsub.mjs`'s doc comment should eventually note the sandbox's `/api/__sandbox__/events` as the alternative path for agents/manual use that don't have `EVENTSUB_WEBHOOK_SECRET`, so the two aren't mistaken for duplicates.
