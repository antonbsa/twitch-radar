# apps/api

Backend conventions for the Hono + Drizzle + D1/KV/Queues Worker.

## Database access

- A fresh `Database` is created per request by middleware in `index.ts` (`c.set("db", new Database(c.env.DB))`); handlers use `c.var.db`, typed via `HonoEnv.Variables`.
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

## Route handlers

- Validate input with a local `zod` schema and `.safeParse`, throw `ApiError(status, code, message)` on failure, respond with `jsonResponse(...)`. See `http/routes/preferences.ts`.
- Preference- and subscription-like rows (`channel_category_preferences`, `global_category_preferences`, `eventsub_subscriptions`, `monitored_channels`) are idempotent lifecycle resources: create is an upsert that revives a disabled row, delete is a soft-disable via `disabled_at`, never a hard delete (ADRs 0029, 0030). A new resource of that shape matches this lifecycle.
- `TwitchEventQueueMessage` and `NotificationJobMessage` in `types.ts` are discriminated unions (ADRs 0032, 0034): extend the union for a new event/job shape instead of adding a parallel message type.
- Read validated config through `AppConfig` (derived in `env.ts`), never `process.env`.

## API contract doc

[docs/api-contract.md](../../docs/api-contract.md) maps the HTTP surface: auth convention, error envelope, the idempotent-create/soft-disable-delete pattern, and an endpoint index. It stays at convention level; request/response shapes live in the route file.

- Update it in the same change when adding, removing, or renaming a route, or changing the auth/error/idempotency convention it describes.
- A change confined to a route's internal logic (no shape or convention change) doesn't need it.
- It's a starting map, not an authority over the code; read the route/schema when the detail matters.

## KV gotchas

- `put(key, value, { expirationTtl })` rejects a TTL under 60 seconds (`Invalid expiration_ttl ... must be at least 60`). It only fails at runtime against the real `wrangler dev` worker, so typecheck and lint pass and the route silently 500s. For a shorter effective window, store a timestamp with a 60s TTL and compare elapsed time yourself. Verify a new TTL by running `tests/api` once, not just typecheck.
- Most `tests/api` files share the fixed `E2E_USER_ID` (`usr_e2e`). `clearDatabase()` wipes D1 and `session:*` KV keys but nothing else, so a new user-keyed KV namespace leaks between tests unless it's cleared in both reset paths of `handleTestReset` in `http/routes/_tests.ts`: the `scope: "all"` branch (prefix-scan delete, like `deleteAllSessions`) and the scoped `E2E_USER_ID` branch (single-key delete, like `deleteSessionsForUser`). Confirm with the full `npm run test:api` suite, since a single-file run can pass while the full run exposes the leak.

## Change together

- Cron expressions are defined once in `src/crons.ts` (so tests can import them) and mirrored by hand into `wrangler.jsonc`'s `triggers.crons`. Edit both in the same change: one without the other silently breaks either the deployed schedule or the tests.
- The zod schema in `src/env.ts` and the `.env.development` placeholders move in the same change.
