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

The Twitch app's redirect URI must be set to `http://localhost:8787/api/auth/twitch/callback` in the Twitch developer console. Then initiate login at:

```txt
http://localhost:8787/api/auth/twitch/start
```

All other variables in `.env.development` have working local defaults, including `API_URL` (the API's own base URL, used to build the OAuth redirect URI). The Vite dev proxy target is fixed to `http://localhost:8787` independent of `API_URL` — the two can diverge (e.g. when tunneling the dev server to another device), see `apps/web/vite.config.ts`.

At this point you can log in, browse channels, and set preferences on the dev machine. The two sections below cover the two things that setup alone doesn't give you: real Web Push notifications, and access from a phone.

## Testing Web Push Notifications

Notifications work the same way whether you're on the dev machine or on mobile (see the next section for mobile access itself) — this section applies to both.

1. Generate a real VAPID key pair — `.env.development`'s `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` are placeholders, not a valid key pair, so Web Push sends will fail signing/encryption until you override them:
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

Opening `http://localhost:5173` or a LAN IP like `http://192.168.x.x:5173` directly from a phone **will not work end-to-end**: Twitch's OAuth redirect goes straight to `API_URL`, which on a phone can't resolve `localhost` back to your dev machine, and even after fixing that, the session cookie is `Secure` (browsers only honor `Secure` cookies over HTTPS or on `localhost`/`127.0.0.1` — a plain-HTTP LAN IP gets neither exemption, so the cookie is silently dropped). Push subscriptions and the service worker also require a secure context, which a bare LAN IP over HTTP isn't.

The fix is one HTTPS tunnel in front of the Vite dev server:

1. Start a tunnel (either works):
   ```sh
   cloudflared tunnel --url http://localhost:5173
   # or: ngrok http 5173
   ```
   Note the HTTPS URL it prints, e.g. `https://random-words.trycloudflare.com`.
2. Set `API_URL` in `.env.local` to that tunnel URL:
   ```sh
   API_URL=https://random-words.trycloudflare.com
   ```
3. **Add the callback URL to your Twitch app's Redirect URIs** in the [Twitch developer console](https://dev.twitch.tv/console/apps): `https://random-words.trycloudflare.com/api/auth/twitch/callback`. You can keep the `localhost` one registered too — Twitch allows multiple.
4. Restart `npm run dev` so both processes pick up the new `API_URL`.
5. On your phone, open the tunnel URL itself — `https://random-words.trycloudflare.com` — not the LAN IP.

Everything else (VAPID keys, enabling notifications, `npm run mock-eventsub`) works exactly as in the previous section; `mock-eventsub` always talks to `API_URL` directly, tunnel or not.

Notes:

- `cloudflared`/`ngrok` quick tunnels get a **new random hostname every restart** — you'll need to re-add the redirect URI in the Twitch console each time, and update `API_URL` in `.env.local` to match. A reserved/named tunnel domain avoids this if you're doing this often.
- `apps/web/vite.config.ts` already allows any `*.trycloudflare.com` host (`server.allowedHosts`) — using a different tunnel provider needs the equivalent domain added there (or use ngrok's own `--host-header` / allowedHosts wildcard).
- Switching back to same-machine-only testing: set `API_URL` back to `http://localhost:8787` in `.env.local` (or delete the override to fall back to `.env.development`'s default) and restart `npm run dev`.

## Validation

Run:

```sh
npm run typecheck
npm run build
npm test
```
