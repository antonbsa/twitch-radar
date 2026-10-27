# Secrets

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
  Generate a **separate** pair for `production` and for `preview` — don't reuse the dev keypair or share one between environments. `VAPID_PRIVATE_KEY` is pushed as a secret; the public half also needs to go into that environment's non-secret `vars` ([environment setup](environment-setup.md#non-secret-vars-per-environment)).

## Error Alerting (Optional)

Both are optional ([ADR 0047](../decisions/0047-error-alerting-via-sentry-and-slack-webhook.md)): an environment without them boots and reports nowhere, and `local` never reports. Push them per environment, from `apps/api`:

- `SENTRY_DSN` — the Sentry project's client key (Project Settings → Client Keys). Events carry the Worker's `ENVIRONMENT` as Sentry's `environment` tag.
- `SLACK_ALERT_WEBHOOK_URL` — a Slack incoming webhook. Set it on `production` and `preview`; each message is prefixed with its environment, and transient platform errors never post.

Both secrets go on `production` and `preview` (preview events are tagged `environment:preview`); a noisy preview burns the free plan's 5,000 events per month, so check it is quiet first. In the backend Sentry project, enable spike protection and create two alert rules (email):

- New or regressed bugs: all environments; triggers "A new issue is created" and "A resolved issue regresses"; filter **none** of "Tagged event `transient` equals `true`"; notify on every trigger.
- Transient platform errors: `production` only; trigger "An event or issue activity is captured"; filters **all** of "Tagged event `transient` equals `true`", "Event level equals warning" and "Number of events more than 5 in 10 minutes"; throttle to 1 hour. Leave these issues unresolved, or every blip mails a regression.

## Frontend Error Reporting (Optional)

`apps/web` reports browser errors to a **separate Sentry project** from the Worker's ([ADR 0047](../decisions/0047-error-alerting-via-sentry-and-slack-webhook.md)). It is configured at build time in the deploy workflows, not with `wrangler secret`; a build without these variables works and reports nowhere:

- `VITE_SENTRY_DSN` — GitHub repository **variable**, the web project's client key. Public by design: it ends up in the bundle. Events carry the Vite mode (`preview`/`production`) as `environment`; local dev never reports.
- `SENTRY_AUTH_TOKEN` — GitHub repository **secret**, an organization auth token with source-map upload scope. It is used only by the build in CI.
- `SENTRY_ORG` / `SENTRY_PROJECT_WEB` — GitHub repository **variables**, the organization and web project slugs.

With the token set, the build uploads source maps and deletes them from `apps/web/dist`, so they are never served. Check with `SENTRY_AUTH_TOKEN=... npm run build` that `find apps/web/dist -name '*.map'` and `grep -r sourceMappingURL apps/web/dist` print nothing. In the web project, create the alert rule (email) on new issues filtered on `environment:production`, and enable spike protection. The service worker is not instrumented.

## Rotating `TWITCH_CLIENT_SECRET`

`TWITCH_CLIENT_SECRET` is shared across every environment pointed at the same Twitch app (currently `production` and `preview` both use one app) — rotating it in the Twitch Developer Console immediately invalidates the old secret everywhere, not just in the environment you're thinking about. A rotation that skips the steps below turned a routine rotation into a multi-day incident (issue #73). Do all of the following, for **every** environment sharing the app, before considering the rotation done:

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

## Secrets Outside Cloudflare

Cloudflare never returns a secret once set, and a dump is only usable with the secrets it was written under ([backup and restore](backup-and-restore.md), [ADR 0063](../decisions/0063-scheduled-encrypted-d1-exports-to-backblaze-b2.md)). Keep `TOKEN_ENCRYPTION_KEY`, the production `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` pair and the `age` private key in a password manager, recorded when each is generated.
