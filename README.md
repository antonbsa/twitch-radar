# Twitch Category Alerts

Mobile-first PWA for Twitch viewers who want push notifications when followed streamers start streaming selected categories.

## Documentation

- [MVP architecture](specs/mvp/00.%20architecture.md)
- [Architecture decisions](docs/decisions/README.md)
- [SDD implementation plan](specs/mvp/01.%20sdd-implementation-plan.md)
- [MVP implementation tasks](specs/mvp/tasks/t-000-global.md)
- [Project guidance](AGENTS.md)

## Local Development

Install dependencies:

```sh
npm install
```

Apply local D1 migrations:

```sh
npm run db:setup
```

Generate a migration after editing the Drizzle schema:

```sh
npm run migrations:create -- --name create_sessions
npm run db:check -w @twitch-radar/api
```

Start the API Worker and the web frontend together:

```sh
npm run dev
```

This runs `dev:api` (Cloudflare Worker, `apps/api`) and `dev:web` (Vite dev server, `apps/web`) concurrently. Open the app at:

```txt
http://localhost:5173
```

The Vite dev server proxies `/api/*` requests to the local Worker, so the frontend and API are same-origin in development.

To run either side alone: `npm run dev:api` or `npm run dev:web`.

Check API health:

```txt
http://localhost:8787/api/health
```

If port `8787` or `5173` is occupied, edit `--port` in `apps/api/package.json` or the `server.port` in `apps/web/vite.config.ts` (and update the proxy target if you change the API port).

To use Twitch OAuth flows locally, create `.env.local` (repo root) with real credentials:

```sh
TWITCH_CLIENT_ID=<your-client-id>
TWITCH_CLIENT_SECRET=<your-client-secret>
```

The Twitch app's redirect URI must be set to `http://localhost:5173/api/auth/twitch/callback` in the Twitch developer console. Then initiate login at:

```txt
http://localhost:5173/api/auth/twitch/start
```

(via Vite's proxy, not `:8787` directly — API and web are same-origin in every environment, including local dev, so there's one `PUBLIC_URL` for both; see `apps/api/src/env.ts`.)

All other variables in `.env.development` have working local defaults, including `PUBLIC_URL` (used both to build the OAuth redirect URI and to send the browser back into the app once login completes). The Vite dev proxy target is fixed to `http://localhost:8787` independent of `PUBLIC_URL` — the two can diverge (e.g. when tunneling the dev server to another device), see `apps/web/vite.config.ts`.

At this point you can log in, browse channels, and set preferences on the dev machine. The two sections below cover the two things that setup alone doesn't give you: real Web Push notifications, and access from a phone.

## Env Validation And Placeholders

`.env.development` is committed and ships safe placeholder values for every secret, so a fresh checkout boots and the test suites run without any real credentials (`AGENTS.md` § "Env Vars: Single Source Of Truth"). `apps/api/src/env.ts` only checks that these vars have the right _shape_ (length, format) — it doesn't know whether a value is a real secret or still the placeholder, since a placeholder is syntactically valid.

Because of that, two secrets that are placeholders by default fail loudly the moment code actually tries to use them for real, rather than at every request:

- `TWITCH_CLIENT_SECRET` (`secret-placeholder`) — `services/twitch/client.ts` checks for this exact string before calling Twitch's OAuth endpoints, and throws a `TwitchConfigError` telling you to get a real secret and add it to `.env.local`. The OAuth callback route turns this into a `500 twitch_not_configured` response instead of a generic error.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (`AAAA...`) — not a valid P-256 key pair, so `services/push/web-push.ts` fails to import them as a signing key and throws with instructions to run `npm run vapid` and copy the output into `.env.local` (see "Testing Web Push Notifications" below). The `GET /api/push/vapid-public-key` endpoint checks this up front too, so the frontend gets a clear error instead of a browser-side `PushManager.subscribe()` crash.

This validation intentionally lives at the point each value is actually used, not in `env.ts` itself: `env.ts` runs on every request, and both test tiers (`tests/api`, `tests/web/e2e`) boot the Worker with only `.env.development` — no real secrets — because they never do a real OAuth round-trip. Rejecting placeholders globally would fail those tests (and every unrelated route in local dev) instead of just the features that need real credentials. The test setups instead pass real (throwaway) values for the specific vars their scenarios exercise, via `wrangler dev --var`.

## Testing Web Push Notifications

Notifications work the same way whether you're on the dev machine or on mobile (see the next section for mobile access itself) — this section applies to both.

1. Generate a real VAPID key pair — `.env.development`'s `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` are placeholders, not a valid key pair, so the API will reject them with a descriptive `vapid_not_configured` error (from `GET /api/push/vapid-public-key`, and from any actual send) until you override them:
   ```sh
   npm run vapid
   ```
   Copy the printed keys into `.env.local`.
2. Restart `npm run dev` so the new keys are picked up.
3. In the app, go to the Account tab and enable notifications (grants the browser permission prompt and creates a real Push subscription).
4. Add a category preference for a broadcaster you follow (Channels tab), and note that broadcaster's numeric Twitch id — visible in the network tab on the `POST /api/preferences/channel` request, or in a `GET /api/channels/followed` response.
5. Force a notification without waiting for the broadcaster to actually go live or change category:
   ```sh
   npm run mock-eventsub -- <broadcasterUserId> <categoryId> "<categoryName>" <baselineCategoryId> "<baselineCategoryName>"
   # e.g. switch a broadcaster from Minecraft into Just Chatting:
   npm run mock-eventsub -- 123456789 509658 "Just Chatting" 27471 Minecraft
   ```
   This signs a forged (but valid) EventSub webhook the same way Twitch would and sends it straight to your local API — no real Twitch event required. It prints the resulting `notification_deliveries` row; your device should get the push. Only works while `ENVIRONMENT !== "production"` (true for all local/dev setups).

## Testing On Mobile (Or Any Other Device)

Opening `http://localhost:5173` or a LAN IP like `http://192.168.x.x:5173` directly from a phone **will not work end-to-end**: Twitch's OAuth redirect goes straight to `PUBLIC_URL`, which on a phone can't resolve `localhost` back to your dev machine, and even after fixing that, the session cookie is `Secure` (browsers only honor `Secure` cookies over HTTPS or on `localhost`/`127.0.0.1` — a plain-HTTP LAN IP gets neither exemption, so the cookie is silently dropped). Push subscriptions and the service worker also require a secure context, which a bare LAN IP over HTTP isn't.

The fix is one HTTPS tunnel in front of the Vite dev server. The fastest path:

```sh
npm run dev:mobile
```

This starts a `cloudflared` quick tunnel targeting `http://localhost:5173`, writes the resulting HTTPS URL into `PUBLIC_URL` in `.env.local`, prints the exact redirect URI to add in the Twitch console, prints a QR code of the tunnel URL to scan on your phone, then starts `npm run dev` (so both processes boot with the new URL already in place). Requires `cloudflared` installed locally. Ctrl+C stops the tunnel and both dev processes together.

The one step it can't automate: **adding the callback URL to your Twitch app's Redirect URIs** in the [Twitch developer console](https://dev.twitch.tv/console/apps) — Twitch has no API for that, only the console UI. You can keep the `localhost` one registered too; Twitch allows multiple redirect URIs at once.

> **Register the full path, not just the tunnel origin.** It must be `https://<tunnel-host>/api/auth/twitch/callback` — registering just `https://<tunnel-host>/` is a redirect-URI mismatch that Twitch's own authorize step doesn't always surface as an error. Symptom if you get this wrong: you complete the Twitch login form fine, land back in the app, and it just shows the login screen again as if nothing happened (with `GET /api/me` returning 401) — easy to mistake for a cookie/session bug. Re-check the console entry first if you hit this.

To do the same thing by hand instead (e.g. with `ngrok`, or to understand what the script is doing):

1. Start a tunnel (either works):
   ```sh
   cloudflared tunnel --url http://localhost:5173
   # or: ngrok http 5173
   ```
   Note the HTTPS URL it prints, e.g. `https://random-words.trycloudflare.com`.
2. Set `PUBLIC_URL` in `.env.local` to that tunnel URL:
   ```sh
   PUBLIC_URL=https://random-words.trycloudflare.com
   ```
3. Add the callback URL to the Twitch console as above: `https://random-words.trycloudflare.com/api/auth/twitch/callback`.
4. Restart `npm run dev` so both processes pick up the new URL.
5. On your phone, open the tunnel URL itself — `https://random-words.trycloudflare.com` — not the LAN IP.

Everything else (VAPID keys, enabling notifications, `npm run mock-eventsub`) works exactly as in the previous section; `mock-eventsub` always talks to `PUBLIC_URL` directly, tunnel or not.

Notes:

- `cloudflared`/`ngrok` quick tunnels get a **new random hostname every restart** — you'll need to re-add the redirect URI in the Twitch console each time (`npm run dev:mobile` prints it for you), and the URL you saved to your phone's home screen will point at a dead tunnel next time, so you'll re-save the PWA too. A reserved/named tunnel domain avoids both if you're doing this often enough to be worth owning a domain for — see [Cloudflare's named tunnel docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (requires a domain added to your Cloudflare account as a zone).
- `apps/web/vite.config.ts` already allows any `*.trycloudflare.com` host (`server.allowedHosts`) — using a different tunnel provider needs the equivalent domain added there (or use ngrok's own `--host-header` / allowedHosts wildcard).
- Switching back to same-machine-only testing: set `PUBLIC_URL` back to `http://localhost:5173` in `.env.local` (or delete the override to fall back to `.env.development`'s default) and restart `npm run dev`.

## Production Setup

The app runs as a single Cloudflare Worker (`apps/api`) on the default `*.workers.dev` domain — no Cloudflare Pages project, no custom domain. `apps/web`'s production build is served as static assets directly from that same Worker (`assets` block in `apps/api/wrangler.jsonc`), so the PWA and the API share one origin. This matters because the session cookie has no `Domain` attribute and there's no CORS handling (`apps/api/src/services/session.ts`) — API and web must always be same-origin, in every environment.

Two `wrangler.jsonc` details that exist specifically to make that work, worth knowing if you're touching config:

- `assets.run_worker_first: ["/api/*"]` — without it, Cloudflare's static-assets layer serves `index.html` for any path that isn't a real file, which includes every `/api/*` route (they never reach the Worker's `fetch` handler at all). This flag forces `/api/*` to always hit the Worker.
- Anything that reads bindings out of `wrangler.jsonc` (`wrangler deploy`, `wrangler d1 migrations apply`, …) needs `--env production` explicitly, or it silently targets the root/dev config instead of `env.production`.

### One-time setup

- D1 database, KV namespace, and two queues created via `wrangler d1 create` / `wrangler kv namespace create --env production` / `wrangler queues create`, with the resulting ids in `apps/api/wrangler.jsonc`'s `env.production` block.
- Secrets pushed via `wrangler secret put <NAME> --env production`:
  - `TWITCH_CLIENT_SECRET` — from the [Twitch Developer Console](https://dev.twitch.tv/console/apps), not generated.
  - `EVENTSUB_WEBHOOK_SECRET` and `TOKEN_ENCRYPTION_KEY` — random secrets, generate each with `openssl rand -base64 32`.
  - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — generated together as a matching pair via `npm run vapid` (the public half also goes into `env.production.vars.VAPID_PUBLIC_KEY`, non-secret).
- Production redirect URI (`https://<PUBLIC_URL host>/api/auth/twitch/callback`) added in the Twitch Developer Console.
- `CLOUDFLARE_API_TOKEN` added as a **repository secret** (`gh secret set CLOUDFLARE_API_TOKEN`, run from this repo) — scoped to this repo only, not shared account-wide, needed by the deploy workflow below.

### Deploying

Every push to `main` deploys automatically via `.github/workflows/deploy.yaml`: lint, typecheck, API tests, and E2E tests run first (skipped if the push came from merging a PR, since those already ran against the `pull_request` event), then pending D1 migrations are applied and `npm run deploy` runs.

To deploy manually instead (e.g. to test a change before merging):

```sh
npm run deploy
```

This builds `apps/web`, then runs `wrangler deploy --env production` from `apps/api`. If you added a new D1 migration, apply it first (not part of `npm run deploy`):

```sh
cd apps/api && npx wrangler d1 migrations apply twitch-radar-prod --remote --env production
```

## Validation

Run:

```sh
npm run typecheck
npm run build
npm test
```
