# apps/api

Backend conventions for the Hono + Drizzle + D1/KV/Queues Worker.

## Database access

- A fresh `Database` is created per request by middleware in `app.ts` (`c.set("db", new Database(c.env.DB))`); handlers use `c.var.db`, typed via `HonoEnv.Variables`.
- New repositories go in `db/repositories/<entity>.ts` as a class taking `AppDatabase` in the constructor, then get wired into the `Database` class in `db/index.ts`.
- Timestamps are ISO-8601 UTC strings (`new Date().toISOString()`), in `*_at` text columns and in repository params like `now`/`cutoff`. Pass that format, not epoch numbers or `Date`s.

## D1 query limits

D1 allows at most **100 bound parameters per query**. Any `inArray(column, ids)` where `ids` may exceed 100 must be chunked. SQLite in tests has no such limit, so an unbatched query passes locally and only fails in production.

```ts
const BATCH_SIZE = 100
for (let i = 0; i < ids.length; i += BATCH_SIZE) {
  const rows = await db
    .select()
    .from(table)
    .where(inArray(col, ids.slice(i, i + BATCH_SIZE)))
    .all()
  results.push(...rows)
}
```

## D1 debug queries

- For a debugging question ("does row X exist", "what's the state of Y"), run the query yourself and report the result; don't hand it back to the user.
- Run it from the repo root against the local dev database:

  ```bash
  cd apps/api && npx wrangler d1 execute twitch-radar-dev --local --command "SELECT * FROM notification_snoozes WHERE user_id = '...'"
  ```

- Keep the exact shape above (`cd apps/api &&` prefix, `--local` before `--command`, query starting with `SELECT`): that is what `.claude/settings.json` allow-lists, so it runs without a prompt.
- Anything that mutates data or schema (`INSERT`, `UPDATE`, `DELETE`, `DROP`, "seed a test row", "reset this field to test X") needs explicit confirmation every time, even against local state: say what it does and what it targets first.
- Never target `twitch-radar-dev` without `--local`. Remote `d1 execute` is denied in `.claude/settings.json` and is never run from an agent session.

## Source layout

- Code is grouped by feature in `src/features/<name>/`: `routes.ts` (handlers; `sync-routes.ts` when a feature has a second router), plus that feature's services, queue/cron jobs and types, each next to its owner. A new endpoint goes in its feature's folder, and `app.ts` mounts it.
- Anything two or more features use goes in `src/lib/` (`crypto`, `base64url`, `logger`) or `src/http/` (`handlers.ts`, `errors.ts`, `response.ts`). The Twitch API client and its sync/token jobs stay in `services/twitch/`, one file per resource (`oauth`, `eventsub`, `users`, `streams`, `categories`, shared `errors`).
- Types live with their owner: a row shape in its `db/repositories/<entity>.ts`, a queue message in its feature's `types.ts`. There is no shared `types.ts`; repeating a repository record type elsewhere lets the two drift without a compile error.
- `db/repositories` stays flat, not grouped by feature: repositories are shared across features (`notifications/match.ts` reads preferences, snoozes, mutes, deliveries and channel state), so grouping them would make features depend on each other's folders.
- `index.ts` only composes `app.ts`, `queues/*` and `scheduled.ts`; route, consumer and cron logic goes in those modules, and it stays the wrangler `main`.

## Route handlers

- Validate input with a local `zod` schema and `.safeParse`, throw `ApiError(status, code, message)` on failure, respond with `jsonResponse(...)`. See `features/preferences/routes.ts`. Shared helpers (`parseBody`, `findOwnedRecord`, `authedRouter`) live in `http/handlers.ts`; mount each authenticated route group on an `authedRouter()` instead of repeating `requireAuth`.
- Preference- and subscription-like rows (`channel_category_preferences`, `global_category_preferences`, `eventsub_subscriptions`, `monitored_channels`) are idempotent lifecycle resources: create is an upsert that revives a disabled row, delete is a soft-disable via `disabled_at`, never a hard delete (ADRs 0029, 0030). A new resource of that shape matches this lifecycle.
- `TwitchEventQueueMessage` and `NotificationJobMessage` (in `features/eventsub/types.ts` and `features/notifications/types.ts`) are discriminated unions (ADRs 0032, 0034): extend the union for a new event/job shape instead of adding a parallel message type.
- Read validated config through `AppConfig` (derived in `env.ts`), never `process.env`.

## API contract doc

[docs/api-contract.md](../../docs/api-contract.md) maps the HTTP surface: auth convention, error envelope, the idempotent-create/soft-disable-delete pattern, and an endpoint index. It stays at convention level; request/response shapes live in the route file.

- Update it in the same change when adding, removing, or renaming a route, or changing the auth/error/idempotency convention it describes.
- A change confined to a route's internal logic (no shape or convention change) doesn't need it.
- It's a starting map, not an authority over the code; read the route/schema when the detail matters.

## KV gotchas

- `put(key, value, { expirationTtl })` rejects a TTL under 60 seconds (`Invalid expiration_ttl ... must be at least 60`). It only fails at runtime against the real `wrangler dev` worker, so typecheck and lint pass and the route silently 500s. For a shorter effective window, store a timestamp with a 60s TTL and compare elapsed time yourself. Verify a new TTL by running `tests/api` once, not just typecheck.
- Most `tests/api` files share the fixed `E2E_USER_ID` (`usr_e2e`). `clearDatabase()` wipes D1 and `session:*` KV keys but nothing else, so a new user-keyed KV namespace leaks between tests unless it's cleared in both reset paths of `handleTestReset` in `http/test-seam/reset.ts`: the `scope: "all"` branch (prefix-scan delete, like `deleteAllSessions`) and the scoped `E2E_USER_ID` branch (single-key delete, like `deleteSessionsForUser`). Confirm with the full `npm run test:api` suite, since a single-file run can pass while the full run exposes the leak.

## Change together

- There is one cron trigger per environment, `* * * * *`, and `scheduled.ts` picks the jobs due from the minute of `controller.scheduledTime` (table in `src/crons.ts`, ADR 0057). Cloudflare caps cron triggers account-wide (5), so a new scheduled job adds a minute-table entry and a `scheduledJobLogFields` name, never a `wrangler.jsonc` trigger. Keep `CRON_MINUTELY` and every `triggers.crons` in `wrangler.jsonc` identical.
- The zod schema in `src/env.ts` and the `.env.development` placeholders move in the same change.
