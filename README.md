# Twitch Radar

Get a push notification the moment someone you follow on Twitch switches into a category you care about.

Mobile-first PWA for Twitch viewers who want push notifications when followed streamers start streaming selected categories. Log in with Twitch, pick the broadcasters and categories you care about, and let a Cloudflare Worker watch EventSub for you in the background — no polling, no app to keep open.

<!-- TODO: add screenshots/demo -->

## Table Of Contents

- [Documentation](#documentation)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Cloning](#cloning)
  - [Environment Configuration](#environment-configuration)
  - [Starting](#starting)
- [Testing Web Push Notifications](#testing-web-push-notifications)
- [Testing On Mobile (Or Any Other Device)](#testing-on-mobile-or-any-other-device)
- [Cloudflare Queues And Cron Triggers](#cloudflare-queues-and-cron-triggers)
- [Deployment](#deployment)
- [Validation](#validation)
- [Contributing](#contributing)

## Documentation

- [MVP architecture](specs/mvp/00.%20architecture.md)
- [Architecture decisions](docs/decisions/README.md)
- [Technical notes](docs/notes/README.md)
- [SDD implementation plan](specs/mvp/01.%20sdd-implementation-plan.md)
- [MVP implementation tasks](specs/mvp/tasks/t-000-global.md)
- [Project guidance](AGENTS.md)

## Getting Started

### Prerequisites

- Node.js and npm (see `package.json` for workspace tooling; no specific version is pinned beyond what the installed `npm`/`node` on your machine already supports).
- A Cloudflare account is **not** required for local development — `wrangler dev` runs entirely locally against local D1/KV state.

### Cloning

```sh
git clone https://github.com/antonbsa/twitch-radar.git
cd twitch-radar
npm install
```

Apply local D1 migrations:

```sh
npm run db:setup
```

### Environment Configuration

`.env.development` (repo root) is committed and ships safe placeholder values for every secret, so a fresh checkout boots and the test suites run without any real credentials (see `AGENTS.md` § "Env Vars: Single Source Of Truth"). `apps/api/src/env.ts` only checks that these vars have the right _shape_ (length, format) — it doesn't know whether a value is a real secret or still the placeholder, since a placeholder is syntactically valid.

Because of that, two secrets that are placeholders by default fail loudly the moment code actually tries to use them for real, rather than at every request:

- `TWITCH_CLIENT_SECRET` (`secret-placeholder`) — `services/twitch/client.ts` checks for this exact string before calling Twitch's OAuth endpoints, and throws a `TwitchConfigError` telling you to get a real secret and add it to `.env.local`. The OAuth callback route turns this into a `500 twitch_not_configured` response instead of a generic error.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (`AAAA...`) — not a valid P-256 key pair, so `services/push/web-push.ts` fails to import them as a signing key and throws with instructions to run `npm run vapid` and copy the output into `.env.local` (see ["Testing Web Push Notifications"](#testing-web-push-notifications) below). The `GET /api/push/vapid-public-key` endpoint checks this up front too, so the frontend gets a clear error instead of a browser-side `PushManager.subscribe()` crash.

This validation intentionally lives at the point each value is actually used, not in `env.ts` itself: `env.ts` runs on every request, and both test tiers (`tests/api`, `tests/web/e2e`) boot the Worker with only `.env.development` — no real secrets — because they never do a real OAuth round-trip. Rejecting placeholders globally would fail those tests (and every unrelated route in local dev) instead of just the features that need real credentials. The test setups instead pass real (throwaway) values for the specific vars their scenarios exercise, via `wrangler dev --var`.

To use Twitch OAuth flows locally, create `.env.local` (repo root, gitignored) with real credentials:

```sh
TWITCH_CLIENT_ID=<your-client-id>
TWITCH_CLIENT_SECRET=<your-client-secret>
```

The Twitch app's redirect URI must be set to `http://localhost:5173/api/auth/twitch/callback` in the Twitch developer console.

All other variables in `.env.development` have working local defaults, including `PUBLIC_URL` (used both to build the OAuth redirect URI and to send the browser back into the app once login completes). The Vite dev proxy target is fixed to `http://localhost:8787` independent of `PUBLIC_URL` — the two can diverge (e.g. when tunneling the dev server to another device), see `apps/web/vite.config.ts`.

### Starting

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

Then initiate login at:

```txt
http://localhost:5173/api/auth/twitch/start
```

(via Vite's proxy, not `:8787` directly — API and web are same-origin in every environment, including local dev, so there's one `PUBLIC_URL` for both; see `apps/api/src/env.ts`.)

At this point you can log in, browse channels, and set preferences on the dev machine. The two sections below cover the two things that setup alone doesn't give you: real Web Push notifications, and access from a phone.

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

## Cloudflare Queues And Cron Triggers

<details>
<summary>How EventSub events and notifications flow through Cloudflare Queues, and what each Cron Trigger does</summary>

This project relies on two Cloudflare-specific runtime primitives beyond the Worker itself, both configured in `apps/api/wrangler.jsonc`.

**Queues.** Two queues decouple receiving a Twitch event from acting on it:

- `TWITCH_EVENTS_QUEUE` (`twitch-radar-twitch-events`) — incoming EventSub webhook payloads, queued as soon as they're signature-verified so the webhook response can return fast (see [ADR 0032](docs/decisions/0032-eventsub-webhook-verification-and-queueing.md)).
- `NOTIFICATION_JOBS_QUEUE` (`twitch-radar-notification-jobs`) — staged push notification jobs, consumed to actually deliver Web Push messages (see [ADR 0034](docs/decisions/0034-notification-matching-and-delivery-pipeline.md)).

Both consumers are configured with `max_batch_size: 10` and `max_batch_timeout: 1` — a one-second timeout rather than waiting for a fuller batch, since notifications are time-sensitive and shouldn't sit in a partially-filled batch window.

**Cron Triggers.** Four cron expressions in `triggers.crons`, dispatched via `controller.cron` in `apps/api/src/index.ts`:

- `* * * * *` — every minute, creates pending EventSub subscriptions (the default branch of the subscription lifecycle — see [ADR 0031](docs/decisions/0031-eventsub-subscription-creation-and-lifecycle.md)).
- `*/30 * * * *` — every 30 minutes, EventSub reconciliation.
- `5,35 * * * *` — twice an hour, Twitch token refresh sweep.
- `10 * * * *` — hourly, stale follow re-sync.

See [ADR 0036](docs/decisions/0036-scheduled-ops-jobs.md) for the rationale behind each job.

**The account-wide 5-cron cap.** Cloudflare caps Cron Triggers at 5 **per account**, not per Worker. Production registers all 4 crons above, leaving only 1 free — so the `preview` environment gets just the minutely pending-subscription job and none of the other three scheduled jobs. Those can still be exercised manually against preview via `wrangler deploy --env preview` plus a manual `/__scheduled?cron=...` request.

</details>

## Deployment

The app runs as a single Cloudflare Worker (`apps/api`) on the default `*.workers.dev` domain — no Cloudflare Pages project, no custom domain. `apps/web`'s production build is served as static assets directly from that same Worker, so the PWA and the API share one origin. Every push to `main` deploys automatically via `.github/workflows/deploy.yaml`: lint, typecheck, API tests, and E2E tests run first, then pending D1 migrations are applied and `npm run deploy` runs.

For the full walkthrough — generating keys, creating Cloudflare resources, pushing secrets, the Twitch console step, and deploying manually — see [`docs/deployment.md`](docs/deployment.md).

## Contributing

This is a solo-maintained project. Issues and pull requests are welcome! For development conventions and contribution guidance, see `CLAUDE.md`.
