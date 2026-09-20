# API Contract

Transversal conventions for `apps/api`'s HTTP surface, plus an index of what exists. This is not a substitute for reading the actual route/schema when the detail matters — request/response field shapes live in the route file itself (`apps/api/src/http/routes/<name>.ts`), not duplicated here, so they can't drift out of sync with this doc. Keep this file in sync when a route is added/removed/renamed or a convention below changes (see `AGENTS.md`'s "API Contract Doc").

## Base & Auth

All routes are mounted under `/api`. Most require a valid session: `requireAuth` middleware reads a session cookie (set by the OAuth callback, ADR 0016) and populates `userId`/`sessionId` on the request context; an unauthenticated request gets a 401.

Routes that don't require a session:

- `GET /health`, `GET /` — liveness.
- `GET /auth/twitch/start`, `GET /auth/twitch/callback` — the OAuth flow itself.
- `POST /webhooks/twitch/eventsub` — called by Twitch, not a user; authenticated via HMAC signature over the raw body (ADR 0032), not a session.
- `/api/__test__/*` — test-seam routes; not registered at all outside non-production builds (ADR 0025), no separate guard.

## Error Envelope (ADR 0009)

Every error response has the same shape:

```json
{ "error": { "code": "string", "message": "string", "requestId": "string" } }
```

`code` is a route-specific string (thrown via `ApiError(status, code, message)`), not an exhaustive enum kept in sync here — read the handler for the exact codes a given route can return. `404`/`405` for unknown routes/methods and `500` for unhandled errors are produced centrally in `index.ts`, not per-route.

## Conventions

- **Idempotent create, soft-disable delete** (ADR 0029, ADR 0030): a create endpoint for a preference/subscription-like resource upserts — a repeat call with the same identity revives a soft-disabled row instead of erroring or duplicating. Response status reflects which happened: `201` for a genuinely new row, `200` when an existing (possibly disabled) row was revived/returned. A delete endpoint soft-disables (`disabled_at`) rather than removing the row, and responds `204`.
- **Notification payloads carry catalog keys, not resolved text** (ADR 0044): `NotificationJobMessage` and the push payload it produces carry `{titleKey, bodyKey, params, lang}` — the receiving client (service worker) resolves the catalog itself. This is an internal queue/push contract, not an HTTP endpoint, but it's part of the same i18n convention as the rest of the API and worth knowing if you're touching notification delivery.
- **D1 batching is an internal detail, not a contract concern** — see `AGENTS.md`'s "D1 Query Constraints"; it never surfaces at the HTTP layer (large `inArray` lookups are batched transparently).

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | no | liveness check |
| GET | `/auth/twitch/start` | no | begins the Twitch OAuth flow |
| GET | `/auth/twitch/callback` | no | OAuth redirect target; creates the session, redirects to `PUBLIC_URL` |
| POST | `/auth/logout` | yes | deletes the current session |
| GET | `/me` | yes | current user, including `twitch_reconnect_required` (ADR 0036) |
| PATCH | `/me/language` | yes | sets the user's language preference (ADR 0044) |
| POST | `/sync/follows` | yes | re-syncs the user's followed channels from Twitch |
| GET | `/channels/followed` | yes | the user's followed channels with current live/category state |
| GET | `/categories/search` | yes | proxies Twitch category search with the user's token |
| GET | `/preferences` | yes | the user's active channel and global category preferences |
| POST | `/preferences/channel` | yes | creates/revives a channel-scoped category preference (ADR 0029) |
| DELETE | `/preferences/channel/:id` | yes | soft-disables a channel-scoped preference |
| POST | `/preferences/global` | yes | creates/revives a global (all-channels) category preference (ADR 0029) |
| DELETE | `/preferences/global/:id` | yes | soft-disables a global preference |
| POST | `/notifications/snooze` | yes | creates a pending 15-minute reminder for a broadcaster/category (ADR 0048) |
| GET | `/notifications/snoozes` | yes | the user's pending snooze reminders |
| POST | `/webhooks/twitch/eventsub` | HMAC | Twitch EventSub notification/challenge/revocation (ADR 0032) |
| GET | `/push/vapid-public-key` | yes | the VAPID public key for Web Push subscription |
| POST | `/push-subscriptions` | yes | creates/upserts a push subscription by endpoint (ADR 0027) |
| DELETE | `/push-subscriptions/:id` | yes | soft-revokes a push subscription |
