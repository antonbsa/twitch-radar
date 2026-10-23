# Run Locally

Get the API and web app running on your machine, with a real Twitch login. No Cloudflare account is needed: `wrangler dev` runs against local D1 and KV state.

Run `npm run doctor` at any point. It checks everything below and names the section to read for each failure.

## Prerequisites

- Node 22, the version pinned in `.nvmrc` (`nvm use` picks it up) and `engines` in `package.json`.
- npm, which ships with Node.
- A Twitch developer application ([console](https://dev.twitch.tv/console/apps)) for the sign-in. Its redirect URI is `http://localhost:5173/api/auth/twitch/callback`.

## Install

```sh
git clone https://github.com/antonbsa/twitch-radar.git
cd twitch-radar
npm install
```

In a new git worktree, run `npm install` at its root too.

## Set Up The Database

```sh
npm run db:setup
```

This applies the migrations to the local D1 database. Run it again after pulling a change that adds a migration.

## Add Your Credentials

`.env.development` is committed and holds safe defaults, so a fresh checkout boots without credentials. Three values are placeholders that `npm run dev` refuses to start with, so put real ones in `.env.local` (repo root, gitignored):

```sh
TWITCH_CLIENT_ID=<your-client-id>
TWITCH_CLIENT_SECRET=<your-client-secret>
```

Generate the VAPID key pair for Web Push and copy the printed keys into the same file as `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`:

```sh
npm run vapid
```

### Which File Wins

Dev scripts merge three env files, not first-match. Lowest to highest precedence:

1. This worktree's `.env.development`.
2. The main worktree's `.env.local`.
3. This worktree's `.env.local`.

So secrets can live once in the main worktree, and another worktree's `.env.local` can hold only ports or a tunnel `PUBLIC_URL` without hiding them. `PUBLIC_URL` is `http://localhost:<WEB_DEV_PORT>` unless a `.env.local` sets it. The Vite proxy always targets the local API port, whatever `PUBLIC_URL` says.

## Start

```sh
npm run dev
```

This runs the API Worker (`dev:api`) and the Vite dev server (`dev:web`) together; run either alone with `npm run dev:api` or `npm run dev:web`. Open `http://localhost:5173`. Vite proxies `/api/*` to the Worker, so the app and API share one origin.

To sign in, go through Vite, not the Worker's port:

```txt
http://localhost:5173/api/auth/twitch/start
```

To explore without a Twitch account, use `npm run dev:sandbox` and sign in as a persona at `/sandbox`.

## Check It Works

```txt
http://localhost:8787/api/health
```

## Ports And Parallel Worktrees

Ports come from `API_DEV_PORT` (8787), `API_INSPECTOR_PORT` (9229) and `WEB_DEV_PORT` (5173) in `.env.development`. To run two worktrees at once, override all three in the second worktree's own `.env.local`:

```sh
API_DEV_PORT=8797
API_INSPECTOR_PORT=9239
WEB_DEV_PORT=5183
```

Vite fails instead of moving to another port when `WEB_DEV_PORT` is taken.

Only one worktree at a time can complete a real Twitch login: each redirect URI registered in the Twitch console names one origin and port. A worktree on another port fails with a redirect-URI mismatch. Register `http://localhost:<WEB_DEV_PORT>/api/auth/twitch/callback` too (Twitch allows several), or do real logins only on the default port.

## Warning: `wrangler dev --remote`

Any `wrangler dev --env <preview|production> --remote` writes into that environment's shared D1 and KV, together with whatever local values are still in effect (`.env.local`, `--env-file`, a stray `--var`). Issue #73 started this way: `eventsub_subscriptions` rows with a `localhost` callback URL, which Twitch rejects for good, went unnoticed for two weeks.

- To work against preview, use `npm run dev:remote`. It sets `PUBLIC_URL` and handles the queue bindings.
- If you run `--remote` by hand, check every env var and `--var` against the remote environment's real values before the server starts, not after.
- When in doubt, run plain `wrangler dev`, which uses local bindings and covers most work.

## Next

- Push notifications: [test-push](test-push.md).
- Another device: [test-on-phone](test-on-phone.md).
