# Deployment

A complete walkthrough for standing up a fresh Cloudflare deployment of this project (production or preview environment), and for redeploying afterwards. This is the full version of the README's short ["Deployment"](../README.md#deployment) section — read that first for the high-level picture (single Worker, automatic preview deploy on push to `main`, production deploy gated behind a GitHub release).

## Prerequisites

- A Cloudflare account, with `wrangler` authenticated against it (`npx wrangler login`, run from `apps/api`).
- A [Twitch Developer Console](https://dev.twitch.tv/console/apps) app (the same one used for local dev works fine — Twitch allows multiple redirect URIs per app).
- `openssl` available locally (for generating random secrets).

## One-Time Cloudflare Setup

These steps create the Cloudflare resources an environment (`production` or `preview`) needs, and wire the resulting ids into `apps/api/wrangler.jsonc`'s `env.<name>` block.

1. **D1 database**:
   ```sh
   npx wrangler d1 create twitch-radar-prod
   ```
   Copy the printed `database_id` into `env.production.d1_databases[0].database_id` (or the `preview` equivalent, with `database_name: twitch-radar-preview`).
2. **KV namespace**:
   ```sh
   npx wrangler kv namespace create KV_APP_CACHE --env production
   ```
   Copy the printed `id` into `env.production.kv_namespaces[0].id`.
3. **Queues** — two per environment. Production and preview each need their own queue names (queue names are account-global, so `preview` can't reuse production's):
   ```sh
   npx wrangler queues create twitch-radar-twitch-events
   npx wrangler queues create twitch-radar-notification-jobs
   ```
   (For `preview`, create `twitch-radar-twitch-events-preview` and `twitch-radar-notification-jobs-preview` instead.) The `queues.producers[].queue` and `queues.consumers[].queue` names in `wrangler.jsonc` must match exactly.
4. **Apply D1 migrations** to the new database:
   ```sh
   cd apps/api && npx wrangler d1 migrations apply twitch-radar-prod --remote --env production
   ```

Run `npx wrangler d1 migrations apply <db-name> --remote --env <env>` again after every subsequent D1 schema change (not part of `npm run deploy`).

## Secrets

Push each of these via `wrangler secret put <NAME> --env <production|preview>` (run from `apps/api`):

- `TWITCH_CLIENT_SECRET` — from the [Twitch Developer Console](https://dev.twitch.tv/console/apps), not generated.
- `EVENTSUB_WEBHOOK_SECRET` — random, generate with:
  ```sh
  openssl rand -base64 32
  ```
- `TOKEN_ENCRYPTION_KEY` — random, generate the same way:
  ```sh
  openssl rand -base64 32
  ```
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — a matching pair, generated together:
  ```sh
  npm run vapid
  ```
  Generate a **separate** pair for `production` and for `preview` — don't reuse the dev keypair or share one between environments. `VAPID_PRIVATE_KEY` is pushed as a secret; the public half also needs to go into that environment's non-secret `vars` (below).

## Non-Secret `vars` (per environment)

In `apps/api/wrangler.jsonc`'s `env.<name>.vars` block, set:

- `ENVIRONMENT` — `"production"` or `"preview"`.
- `PUBLIC_URL` — the environment's `*.workers.dev` URL. For a brand-new environment this isn't known until after the first deploy (Wrangler prints it), so deploy once, then fill this in and redeploy.
- `TWITCH_CLIENT_ID` — the Twitch app's client id (same app across environments is fine).
- `VAPID_PUBLIC_KEY` — the public half of that environment's VAPID keypair (see above).
- `VAPID_SUBJECT` — a `mailto:` contact address, per the Web Push VAPID spec.

## Twitch Developer Console

Add the environment's callback URL as a Redirect URI on the Twitch app, in the [Twitch Developer Console](https://dev.twitch.tv/console/apps):

```txt
https://<PUBLIC_URL host>/api/auth/twitch/callback
```

Twitch allows multiple redirect URIs per app, so production, preview, and local dev/tunnel URIs can all be registered at once.

## GitHub Repository Secret

Both deploy workflows (below) need Cloudflare API credentials to run `wrangler` commands in CI:

```sh
gh secret set CLOUDFLARE_API_TOKEN
```

Run from this repo so the secret is scoped to it, not shared account-wide across other repos. The same token is used for both `preview` and `production` deploys.

## Deploying

Two independent pipelines:

- **Preview** — every push to `main` deploys automatically via [`.github/workflows/deploy-preview.yaml`](../.github/workflows/deploy-preview.yaml): lint, typecheck, API tests, and E2E tests run first (skipped if the push came from merging a PR, since those already ran against the `pull_request` event), then pending D1 migrations are applied against `twitch-radar-preview` and `npm run deploy:preview` runs.
- **Production** — publishing a [GitHub release](https://github.com/antonbsa/twitch-radar/releases/new) deploys via [`.github/workflows/deploy-release.yaml`](../.github/workflows/deploy-release.yaml). The workflow checks out the release's tag, re-runs the full lint/typecheck/API/E2E suite against that exact commit (not skipped, since a release isn't necessarily tied to a just-checked PR), then applies pending D1 migrations against `twitch-radar-prod` and runs `npm run deploy`. `main` moving forward never touches production by itself — only publishing a release does. To cut one: pick the `main` commit to ship, create a tag (e.g. `v0.1.1`) and publish a release against it from the GitHub UI, using "Generate release notes" for the changelog — its categories come from [`.github/release.yml`](../.github/release.yml). The full checklist for cutting a release (version choice, migration/config/service-worker call-outs, notes structure) is in [preparing-a-release](../.claude/skills/preparing-a-release).

To deploy manually instead (e.g. to test a change before merging):

```sh
npm run deploy           # builds apps/web, then `wrangler deploy --env production` from apps/api
npm run deploy:preview   # same, but `wrangler deploy --env preview`
```

If you added a new D1 migration, apply it first (not part of either `deploy` script):

```sh
cd apps/api && npx wrangler d1 migrations apply twitch-radar-prod --remote --env production
# or, for preview:
cd apps/api && npx wrangler d1 migrations apply twitch-radar-preview --remote --env preview
```
