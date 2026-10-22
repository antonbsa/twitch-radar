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

### Error alerting (optional)

Both are optional ([ADR 0047](decisions/0047-error-alerting-via-sentry-and-slack-webhook.md)): an environment without them boots and reports nowhere, and `local` never reports. Push them per environment, from `apps/api`:

- `SENTRY_DSN` — the Sentry project's client key (Project Settings → Client Keys). Events carry the Worker's `ENVIRONMENT` as Sentry's `environment` tag.
- `SLACK_ALERT_WEBHOOK_URL` — a Slack incoming webhook. Any environment that has it posts to Slack, so keep it on `production` only; for a preview smoke test, point it at a test channel and remove it afterwards.

`SENTRY_DSN` can go on `preview` too (events are tagged `environment:preview`); first check preview is quiet, since a noisy one burns the free plan's 5,000 events per month. In the Sentry project, enable spike protection and create the alert rule (email) filtered on `environment:production`.

### Frontend error reporting (optional)

`apps/web` reports browser errors to a **separate Sentry project** from the Worker's ([ADR 0047](decisions/0047-error-alerting-via-sentry-and-slack-webhook.md)). It is configured at build time in the deploy workflows, not with `wrangler secret`; a build without these variables works and reports nowhere:

- `VITE_SENTRY_DSN` — GitHub repository **variable**, the web project's client key. Public by design: it ends up in the bundle. Events carry the Vite mode (`preview`/`production`) as `environment`; local dev never reports.
- `SENTRY_AUTH_TOKEN` — GitHub repository **secret**, an organization auth token with source-map upload scope. It is used only by the build in CI.
- `SENTRY_ORG` / `SENTRY_PROJECT_WEB` — GitHub repository **variables**, the organization and web project slugs.

With the token set, the build uploads source maps and deletes them from `apps/web/dist`, so they are never served. Check with `SENTRY_AUTH_TOKEN=... npm run build` that `find apps/web/dist -name '*.map'` and `grep -r sourceMappingURL apps/web/dist` print nothing. In the web project, create the alert rule (email) on new issues filtered on `environment:production`, and enable spike protection. The service worker is not instrumented.

### Rotating `TWITCH_CLIENT_SECRET`

`TWITCH_CLIENT_SECRET` is shared across every environment pointed at the same Twitch app (currently `production` and `preview` both use one app) — rotating it in the Twitch Developer Console immediately invalidates the old secret everywhere, not just in the environment you're thinking about. A rotation that only updates the secret and skips the remaining steps below is exactly what turned a routine rotation into a multi-day incident (issue #73): the missing step wasn't an oversight of a known checklist, there simply wasn't one. Do all of the following, for **every** environment sharing the app, before considering the rotation done:

1. **Rotate the secret** in the [Twitch Developer Console](https://dev.twitch.tv/console/apps) for the app.
2. **Push the new value to every environment sharing that app**:
   ```sh
   cd apps/api
   npx wrangler secret put TWITCH_CLIENT_SECRET --env production
   npx wrangler secret put TWITCH_CLIENT_SECRET --env preview
   ```
   A dangling old value in even one environment starts producing `401 Invalid OAuth token` failures against Twitch as soon as the app-access-token cache (next step) rolls over.
3. **Purge the cached app access token from KV, per environment.** `services/twitch/app-token.ts` caches the app-access-token (client-credentials grant) in KV for up to ~60 days; a token fetched under the old secret stays valid-looking to this app and keeps getting reused (and, on eventual EventSub calls, rejected by Twitch) for up to that long unless evicted:
   ```sh
   npx wrangler kv key delete --remote --namespace-id <KV_APP_CACHE id for the env> "twitch:app_access_token"
   ```
   The namespace id for each environment is `env.<name>.kv_namespaces[0].id` in `apps/api/wrangler.jsonc`. The next scheduled job or EventSub creation run then fetches a fresh token under the new secret.

Any other Worker secret shared across `production` and `preview` (there currently isn't one besides `TWITCH_CLIENT_SECRET`) should be rotated the same way: push to every environment that shares it before considering the rotation complete, and check whether anything caches a value derived from it (as the app access token does here) that also needs evicting.

### Hazard: `wrangler dev --remote` Against A Shared Environment

`npm run dev:remote` (`infra/scripts/dev/remote-preview.mjs`) runs `wrangler dev --env preview --remote` — a local dev server bound to preview's real, shared D1/KV, not the isolated local-dev database `apps/api/wrangler.jsonc`'s top-level `d1_databases` entry exists specifically to avoid. That script already overrides `PUBLIC_URL` to the local origin for exactly this reason (see its own header comment) — but the underlying hazard is general: **any** `wrangler dev --env <preview|production> --remote` invocation writes directly into that environment's real, shared state, and any local env file still in effect (`.env.local`, an `--env-file` flag, a stray `--var`) that carries local-dev values (`PUBLIC_URL=http://localhost:...`, a placeholder secret, etc.) writes those bad values into it too. This is exactly how issue #73's preview incident started: `pending` `eventsub_subscriptions` rows seeded with a `localhost` `callback_url` that Twitch permanently rejects, sitting undetected for over two weeks. Before running `wrangler dev` with `--remote` against `preview` or `production`:

- Prefer the existing `npm run dev:remote` script for preview rather than a hand-rolled invocation — it already handles the `PUBLIC_URL` override and the queues-binding incompatibility (see its comments).
- If you must invoke `wrangler dev --remote` by hand, double-check every env var/`--var` override actually reflects that remote environment's real values before the server starts accepting requests — not after.
- When in doubt, don't run `--remote` at all: plain `wrangler dev` (no `--remote`) against the local D1/KV bindings is safe by construction and covers the overwhelming majority of local development needs.

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

## CI Test Reports Repo

Failed PR test runs publish their reports to a separate Pages repo ([ADR 0060](decisions/0060-publish-failed-ci-test-reports-to-a-pages-repo.md)). One-time setup:

1. Create the public repo `<owner>/<repo>-ci-reports` (this repo's name plus `-ci-reports`, same owner; the workflows derive it from `GITHUB_REPOSITORY`, so a clone sets up its own) and push an initial commit on `main`. In Settings → Pages, serve from branch `main`, folder `/`.
2. Generate a key pair: `ssh-keygen -t ed25519 -N "" -C ci-reports -f ci-reports-key`.
3. Add `ci-reports-key.pub` to the reports repo under Settings → Deploy keys, with "Allow write access" checked.
4. From this repo, store the private key: `gh secret set CI_REPORTS_DEPLOY_KEY < ci-reports-key`. Then delete both key files.

The reports repo is disposable: if it breaks, delete and recreate it, and the next failing run repopulates it.

## Deploying

Two independent pipelines:

- **Preview** — every push to `main` deploys automatically via [`.github/workflows/deploy-preview.yaml`](../.github/workflows/deploy-preview.yaml): the [Code quality](../.github/workflows/code-quality.yaml) and [Automated tests](../.github/workflows/tests.yaml) workflows run first (skipped if the push came from merging a PR, since those already ran against the `pull_request` event), then pending D1 migrations are applied against `twitch-radar-preview` and `npm run deploy:preview` runs.
- **Production** — publishing a [GitHub release](https://github.com/antonbsa/twitch-radar/releases/new) deploys via [`.github/workflows/deploy-release.yaml`](../.github/workflows/deploy-release.yaml). The workflow checks out the release's tag, re-runs the Code quality and Automated tests workflows against that exact commit (not skipped, since a release isn't necessarily tied to a just-checked PR), then applies pending D1 migrations against `twitch-radar-prod` and runs `npm run deploy`. `main` moving forward never touches production by itself — only publishing a release does. To cut one: pick the `main` commit to ship, create a tag (e.g. `v0.1.1`) and publish a release against it from the GitHub UI, using "Generate release notes" for the changelog — its categories come from [`.github/release.yml`](../.github/release.yml). The full checklist for cutting a release (version choice, migration/config/service-worker call-outs, notes structure) is in [release](../.claude/skills/release).

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

## Stopping A Misbehaving Pipeline

When a deployed Worker is doing damage (repeat pushes, a job hammering the Twitch API, a loop), stop the pipeline first and fix the code through the normal release afterwards. A fix through the release pipeline takes the full suite plus a deploy; these levers act in seconds and need no code change. Run them from `apps/api`, with `-preview` queue names and `--env preview` for preview.

| Pipeline | Lever | What stops | What to watch |
| --- | --- | --- | --- |
| Push delivery | `npx wrangler queues pause-delivery twitch-radar-notification-jobs` | Every push, including snooze reminders | Matching keeps enqueueing while paused, so the backlog is late on resume |
| EventSub processing | `npx wrangler queues pause-delivery twitch-radar-twitch-events` | Channel State updates and new notification matches | Webhooks are still accepted and queued; on resume, an event older than the last one applied to that Channel State is ignored as a Stale Event ([ADR 0033](decisions/0033-eventsub-state-transition-rules.md)) |
| Scheduled jobs | Delete the cron trigger on the Worker's settings page in the Cloudflare dashboard | All jobs at once: there is one trigger for every job ([ADR 0057](decisions/0057-single-minutely-cron-trigger.md)), so token refresh and EventSub creation stop too | The next `wrangler deploy` restores the trigger from `wrangler.jsonc` |
| The whole Worker | `npx wrangler rollback --env production -m "<reason>"` | The new code, back to the previous version | D1 isn't rolled back: if the release ran a migration, the old code must still work on the new schema, or restore with Time Travel (below) |

Resume a queue with `npx wrangler queues resume-delivery <queue>`. A push is only meaningful while it's still true (a channel just went live in a category), so purge the notification backlog before resuming unless the pause was a few seconds: `npx wrangler queues purge twitch-radar-notification-jobs` deletes every stored message, irreversibly. Messages still expire past the queue's retention period while paused.

Two pipelines have no lever yet: a single scheduled job can't be stopped without stopping the rest, and the on-demand follow sync (login and the Sync button) only stops with a rollback.

The `CLOUDFLARE_API_TOKEN` used for these commands needs the Account › Queues › Edit permission: without it `pause-delivery` fails with `Authentication error [code: 10000]` while read-only commands like `wrangler queues info` still work, so a token that deploys fine can still be missing it. Rehearse on preview after creating or rotating the token: pause and resume `twitch-radar-notification-jobs-preview` and check both commands succeed.

## Backup And Recovery

What is lost depends on what is restored. D1 holds everything that can't be rebuilt: users, encrypted Twitch tokens, push subscriptions, follows, preferences and delivery history. KV holds only disposable state (sessions, OAuth state, the app token), and Twitch-side EventSub subscriptions are repaired by reconciliation within 30 minutes ([architecture overview](architecture/overview.md#recovery)).

**Restore to a point in time (bad migration, bad write).** D1 Time Travel keeps a point-in-time history of each database (30 days on the paid plan, 7 on the free plan). Run from `apps/api`:

```sh
npx wrangler d1 time-travel info twitch-radar-prod --env production
npx wrangler d1 time-travel restore twitch-radar-prod --env production --timestamp=<ISO-8601 or unix>
```

The restore rewrites the database in place and prints the bookmark from just before it; restoring to that bookmark undoes the restore. Everything written after the chosen time is lost, including delivery rows for pushes that already went out, so the cooldown (ADR 0056) may let a repeat notification through in the window afterwards.

Every release run prints the Time Travel bookmark from just before the migrations in its job summary; undoing a bad migration is `npx wrangler d1 time-travel restore twitch-radar-prod --env production --bookmark=<bookmark>`.

**Off-site copy.** Time Travel doesn't survive deleting the database or losing the account, so `.github/workflows/backup-d1.yaml` exports production every day at 03:17 UTC ([ADR 0063](decisions/0063-scheduled-encrypted-d1-exports-to-backblaze-b2.md)). It moves the `INSERT` statements after the schema (wrangler writes tables alphabetically, so a child table would otherwise get rows before its parent exists), imports the dump into a local D1, fails if `users` or `d1_migrations` is empty, encrypts it with `age` to the public key in `infra/backups/age-recipient.txt`, and uploads `twitch-radar-prod-<timestamp>.sql.age` to a Backblaze B2 bucket. A failed run emails through GitHub's workflow-failure notification. `preview` is not backed up. The dump holds encrypted tokens and push endpoints; never commit a decrypted one.

**One-time backup setup.**

1. Generate the `age` keypair with `age-keygen -o age-key.txt`. Put the public key (the `age1...` line) in `infra/backups/age-recipient.txt` and store the whole file in the password manager; delete the local copy.
2. In Backblaze B2, create a private bucket and a lifecycle rule that keeps only the last version for 30 days. Create an application key limited to that bucket.
3. Set the smallest daily caps the console accepts for storage and Class A, B and C transactions. Confirm a cap blocks: an upload with the `X-Bz-Test-Mode: force_cap_exceeded` header must return `403 cap_exceeded`.
4. In GitHub, set the secrets `B2_KEY_ID` and `B2_APPLICATION_KEY` and the variables `B2_BUCKET`, `B2_ENDPOINT` (for example `https://s3.us-west-004.backblazeb2.com`) and `B2_REGION` (for example `us-west-004`).
5. Run the workflow once from the Actions tab (`workflow_dispatch`) and check the object appears in the bucket.

**Secrets outside Cloudflare.** Cloudflare never returns a secret once set, and a dump is only usable with the secrets it was written under. Keep `TOKEN_ENCRYPTION_KEY`, the production `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` pair and the `age` private key in a password manager, recorded when each is generated.

**Restore from an off-site dump.**

1. Download the latest object from the bucket and decrypt it: `age --decrypt --identity age-key.txt --output dump.sql twitch-radar-prod-<timestamp>.sql.age`.
2. Create a database as in "One-Time Cloudflare Setup" (or empty the target one), point the environment's `database_id` at it, and run `npx wrangler d1 execute <db> --remote --env <env> --file=dump.sql` from `apps/api`.
3. Set `TOKEN_ENCRYPTION_KEY` and the VAPID keypair back to the stored values, then follow "After a restore or a rebuild".

Rehearse this every few months by restoring the latest dump into `preview` (`twitch-radar-preview`), and note the date and result in the PR that changes the process.

**After a restore or a rebuild:**

1. Wait for (or watch) the 30-minute reconciliation: it recreates missing EventSub subscriptions and deletes ones the database no longer knows ([monitoring](architecture/monitoring.md)).
2. If the database came back empty, users sign in again and re-create their alerts; nothing else restores them. Sessions for ids that no longer exist fail authorization and send the person to the login screen.
3. If `TOKEN_ENCRYPTION_KEY` changed, restored tokens can't be decrypted: every user lands in the reconnect state and signs in again.
4. If the VAPID keypair changed, every restored push subscription is silently invalid: every user re-enables push.
