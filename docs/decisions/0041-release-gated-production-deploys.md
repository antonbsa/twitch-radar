# 0041 - Release-Gated Production Deploys, Automatic Preview Deploys

## Status

Accepted

## Context

`.github/workflows/deploy.yaml` deployed straight to production on every push to `main`: lint/typecheck/API tests/E2E tests, then D1 migrations against `twitch-radar-prod`, then `wrangler deploy --env production`. The `preview` environment already existed in `apps/api/wrangler.jsonc` (its own D1, KV, and queues — see ADR 0037's Worker route note and the wrangler.jsonc `preview` block) but was never deployed by CI, only manually via `npm run deploy:preview`.

Every merge landing directly in production is Continuous Deployment, which is the right default when the only gate needed is the test suite and the blast radius of a bad deploy is low. That stopped being true here: D1 migrations are not easily reversible, EventSub subscriptions and Web Push subscriptions are tied to real devices, and a bad deploy risks losing a real-time notification silently rather than just serving an error page. The `preview` environment exists specifically to absorb that risk (real deploy path, real D1/queues, isolated from production data) but sat unused in the automated pipeline.

Two ways to add a gate between merge and production were considered:

1. **GitHub Environment manual approval** — a `production` environment with required reviewers; the same commit that already deployed to preview pauses for a click before deploying to prod.
2. **Release-gated deploy** — preview deploys automatically on every merge to `main`; production only deploys when a GitHub release is published against a chosen commit.

Both add a deliberate human act between merge and production. Approval is lower-ceremony (one click, no versioning). Release-gated adds real value beyond the gate itself: a tag gives the project a version history, and GitHub's "Generate release notes" turns merged PR titles into a changelog for free — useful for a PWA with a service worker, where knowing what shipped when has standalone value.

## Decision

Split the single `deploy.yaml` into two independent workflows, matching the two environments:

- **`deploy-preview.yaml`** — trigger: `push` to `main`. Runs lint/typecheck/API tests/E2E tests (skipped if the push came from a merged PR, since `linting.yaml`/`tests.yaml` already ran them against that PR), applies pending D1 migrations against `twitch-radar-preview`, then `npm run deploy:preview`.
- **`deploy-release.yaml`** — trigger: `release: published`. Checks out the release's tag, always re-runs the full lint/typecheck/API/E2E suite against that exact commit (not skipped — a release isn't necessarily tied to a just-checked PR, e.g. a tag could be created against an older `main` commit), applies pending D1 migrations against `twitch-radar-prod`, then `npm run deploy`.

`main` moving forward never touches production by itself. Production only advances when someone deliberately tags a commit and publishes a release. Versioning starts at `v0.1.0` (SemVer, major pinned at 0 while the MVP is still under active development per the Implementation Order in `CLAUDE.md`) — not `v1.0.0`.

The git tag is the sole source of truth for the project's version — `deploy-release.yaml` never reads or writes `package.json`, and nothing in the codebase reads its `version` field. The `"version"` key is removed from the root, `apps/api`, and `apps/web` `package.json` files (they previously read a stale, hand-set `"1.0.0"` with no relation to the release tags) to avoid implying it tracks anything.

Both workflows keep using the single `CLOUDFLARE_API_TOKEN` repository secret already provisioned — no new secret, since one Cloudflare account token authorizes deploys to both environments' resources.

## Consequences

- Every merge to `main` gets exercised end-to-end in a real Cloudflare environment (deploy, migrations, EventSub webhook flow) before it can reach production — closes the gap where migrations previously ran in production first.
- Shipping to production requires one extra manual step (create a tag, publish a release) that didn't exist before. For a solo-maintained project this is intended friction, not accidental overhead — see the deploy sequence in `docs/deployment.md`.
- The `preview` environment's known gap (documented in `apps/api/wrangler.jsonc`) — Cloudflare's account-wide 5-cron-trigger cap leaves preview with only the minutely job, not the reconcile/token-refresh/stale-follow-sync crons — still applies. Preview validates deploy and migrations, not those three scheduled jobs; they remain manually exercised via `/__scheduled?cron=...` against a running preview deploy.
- `README.md`'s "Deployment" section and `docs/deployment.md` are updated to describe both pipelines and the release step; anything referencing the old single `deploy.yaml` no longer applies.
