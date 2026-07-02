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
npm run db:generate -- --name create_sessions
npm run db:check
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

All other variables in `.env.development` have working local defaults, including `API_URL` (the API's own base URL — also read by the Vite dev proxy).

## Validation

Run:

```sh
npm run typecheck
npm run build
npm test
```
