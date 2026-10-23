# Environment Setup

A complete walkthrough for standing up a fresh Cloudflare deployment of this project (production or preview environment). The project is a single Worker that serves the API and the web app; how changes reach each environment is in [deploy and release](../architecture/deploy-and-release.md) ([ADR 0041](../decisions/0041-release-gated-production-deploys.md)), and the deploy commands are in [deploying](deploying.md). Secrets are in [secrets](secrets.md).

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

Run `npx wrangler d1 migrations apply <db-name> --remote --env <env>` again after every subsequent D1 schema change (not part of `npm run deploy`); see [deploying](deploying.md).

## Non-Secret `vars` (per environment)

In `apps/api/wrangler.jsonc`'s `env.<name>.vars` block, set:

- `ENVIRONMENT` — `"production"` or `"preview"`.
- `PUBLIC_URL` — the environment's `*.workers.dev` URL. For a brand-new environment this isn't known until after the first deploy (Wrangler prints it), so deploy once, then fill this in and redeploy.
- `TWITCH_CLIENT_ID` — the Twitch app's client id (same app across environments is fine).
- `VAPID_PUBLIC_KEY` — the public half of that environment's VAPID keypair ([secrets](secrets.md)).
- `VAPID_SUBJECT` — a `mailto:` contact address, per the Web Push VAPID spec.

## Twitch Developer Console

Add the environment's callback URL as a Redirect URI on the Twitch app, in the [Twitch Developer Console](https://dev.twitch.tv/console/apps):

```txt
https://<PUBLIC_URL host>/api/auth/twitch/callback
```

Twitch allows multiple redirect URIs per app, so production, preview, and local dev/tunnel URIs can all be registered at once.

## GitHub Repository Secret

Both deploy workflows ([deploying](deploying.md)) need Cloudflare API credentials to run `wrangler` commands in CI:

```sh
gh secret set CLOUDFLARE_API_TOKEN
```

Run from this repo so the secret is scoped to it, not shared account-wide across other repos. The same token is used for both `preview` and `production` deploys.

## CI Test Reports Repo

Failed PR test runs publish their reports to a separate Pages repo ([ADR 0060](../decisions/0060-publish-failed-ci-test-reports-to-a-pages-repo.md)). One-time setup:

1. Create the public repo `<owner>/<repo>-ci-reports` (this repo's name plus `-ci-reports`, same owner; the workflows derive it from `GITHUB_REPOSITORY`, so a clone sets up its own) and push an initial commit on `main`. In Settings → Pages, serve from branch `main`, folder `/`.
2. Generate a key pair: `ssh-keygen -t ed25519 -N "" -C ci-reports -f ci-reports-key`.
3. Add `ci-reports-key.pub` to the reports repo under Settings → Deploy keys, with "Allow write access" checked.
4. From this repo, store the private key: `gh secret set CI_REPORTS_DEPLOY_KEY < ci-reports-key`. Then delete both key files.

The reports repo is disposable: if it breaks, delete and recreate it, and the next failing run repopulates it.
