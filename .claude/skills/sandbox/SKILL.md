---
name: sandbox
description: Use when asked to log in as a persona, emit a notification/go-live/category-switch for a user, or manually test the app without a Twitch account (ADR 0046).
---

# Sandbox Personas And Event Injection

Personas are fixed fictional users: `full` (109 follows, 90 pre-synced, 19 live, one channel and one global preference), `empty` (zero synced follows), `reconnect` (token needing re-auth), `muted_paused` (notifications paused, one mute, one exclusion), `heavy_prefs` (60 channel and 20 global preferences), `rate_limited` (Helix answers follow/stream reads with 429). Fixtures: `infra/fixtures/sandbox/<persona>.json`. Use the sandbox, not `mock-eventsub.mjs`, for anything an agent does: it needs no webhook secret and works in preview.

1. Start the stack with `npm run dev:sandbox` (plain `npm run dev` leaves Sync and category search calling real Twitch). The web origin is `http://localhost:<WEB_DEV_PORT>` (default 5173); `/api` proxies to the worker.
2. Log in over HTTP and keep the cookie: `curl -c jar -X POST -H 'Content-Type: application/json' -d '{"persona":"full"}' http://localhost:5173/api/__sandbox__/login`. In a browser, open `/sandbox` and click the persona. Logging in again resets the persona's follows, preferences, snoozes and mutes to the fixture.
3. Emit an event for one of the persona's followed channels (`broadcasterUserId` is `sbx_bc_*` from the fixture; `categoryId` must be in `infra/fixtures/sandbox/categories.json`):
   - `curl -b jar -X POST -H 'Content-Type: application/json' -d '{"type":"go_live","broadcasterUserId":"sbx_bc_cinder","categoryId":"512953"}' http://localhost:5173/api/__sandbox__/events`
   - `type` is `go_live` (stream.online) or `switch_category` (channel.update; 409 `channel_not_live` unless the channel is live). A channel the persona doesn't follow returns 404, a non-persona session 403.
4. Read the result: `data.notified: true` means a delivery row exists for this event and push went out; `false` with a `change_type` means the event applied but no preference matched, or the 15-minute per-broadcaster cooldown (ADR 0056) was active, or the user is paused/muted/snoozed. Report which, and change the setup (step 5) or pick another channel; the cooldown is not bypassed.

## Changing a persona's settings

Pass `overrides` at login to set up the case before emitting the event. Keys are optional and each one replaces the fixture's value wholesale:

`curl -c jar -X POST -H 'Content-Type: application/json' -d '{"persona":"full","overrides":{"notificationsPaused":false,"language":"pt-BR","tokenState":"valid","mutedBroadcasterUserIds":["sbx_bc_aurora"],"preferences":{"channel":[{"broadcasterUserId":"sbx_bc_cinder","categoryId":"512953"}],"global":[{"categoryId":"27471","excludedBroadcasterUserIds":["sbx_bc_bytewolf"]}]}}}' http://localhost:5173/api/__sandbox__/login`

- `preferences` replaces both lists (omit `channel` or `global` for none); channels and exclusions must be pre-synced follows of the persona, categories must be in `categories.json`, else 400.
- Pick the closest persona and override the difference; `muted_paused` already has every suppressor on, so `{"notificationsPaused":false,"mutedBroadcasterUserIds":[]}` isolates the rest.
- Follows, live streams and `rate_limited` are fixture-only; to change those edit the fixture.
- After login the persona cookie is a real session, so the app's own API (`/api/preferences`, `PATCH /api/me/notifications-paused`, `POST /api/notifications/mutes`, `POST /api/notifications/snooze`, `PATCH /api/me/language`) changes settings mid-test. The next login restores the fixture, or whatever `overrides` it carries.

## Gotchas

- Symptom: `go_live` on a channel returns `notified: false` right after a previous event. Why it slips: the cooldown is keyed by broadcaster, so every channel needs its own first event. Verify by repeating the event on an untouched `sbx_bc_*` channel that has a matching preference.
- Symptom: Sync follows pulls real follows or errors. Why it slips: the worker was started with `npm run dev`. Verify the process was launched through `dev:sandbox`.
- Push reaches the browser only after push is enabled for that session in the app (Account); iOS needs the installed PWA through the tunnel (root `AGENTS.md`, "iOS PWA Is The Primary Platform").
