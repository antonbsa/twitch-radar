# Project Guidance

## Source Of Truth

For future implementation work, treat [specs/mvp/00. architecture.md](specs/mvp/00.%20architecture.md) as the primary product/system specification.

Decision documentation policy: [ADR 0001](docs/decisions/0001-keep-project-decisions-in-adrs.md).

Non-decision research policy: [ADR 0039](docs/decisions/0039-adopt-technical-notes-for-non-decision-research.md).

## Development Workflow

The expected path from idea to merged change:

1. **Issue (optional).** GitHub issues may describe work generically — a bug report, a rough feature idea — before it's scoped. Not every change needs one; skip straight to a spec for well-understood work. An issue may also be the input used to draft a spec.
2. **Spec.** From there on, work is driven by a spec under `specs/milestones/<name>` (see "Spec Location" below) describing goals, requirements, scope, and validation.
3. **Decision changes.** If the spec requires an accepted decision, add or update an ADR per [ADR 0001](docs/decisions/0001-keep-project-decisions-in-adrs.md) before broad coding. Non-decision research/conclusions go in a TN instead (see "ADRs vs Technical Notes" below).
4. **Implementation.** Code the change, committed together with the spec/task updates it completes.
5. **Review and merge.** Open a PR following [creating-pull-requests](.claude/skills/creating-pull-requests) — tests, migrations/config, and specs/ADRs are part of the review, not follow-ups.

## Spec Location

The MVP spec at `specs/mvp/` is closed to new work. From now on, all new specs must live under `specs/milestones/<name>`, one directory per milestone, e.g. milestone 0: `specs/milestones/0-foundations`.

## Scope Boundary

The original proof-of-concept (Fastify server, local JSON storage, vanilla JS frontend) was historical Web Push validation material and has been removed from the repo — it is not present at any current path. If a task needs to reference its Push API/service worker/notification-matching logic (see [T-005](specs/mvp/tasks/t-005-pwa-shell-and-push.md) and [T-008](specs/mvp/tasks/t-008-notification-delivery-and-ops.md)), check out commit `e8417e9` ("feat: initialize PWA notification POC"). MVP work should follow the active MVP spec and accepted ADRs, not the POC's architecture (see [ADR 0010](docs/decisions/0010-keep-poc-separate-from-mvp-architecture.md)).

## Implementation Order

Follow the MVP phases from the architecture spec:

1. Auth and PWA shell.
2. Preferences.
3. EventSub.
4. State and matching.
5. Notification delivery.

When implementation details are unclear, update or extend the MVP spec for requirements and follow [ADR 0001](docs/decisions/0001-keep-project-decisions-in-adrs.md) for decision changes before coding broad changes.

## ADRs vs Technical Notes

Two directories capture different things — do not conflate them:

- `docs/decisions` (ADRs) — an **accepted decision** that the code is expected to reflect. Use when a change is being made or has been made.
- `docs/notes` (TNs) — a **researched conclusion that is not an action**. Use when a discussion, investigation, or alignment reaches a conclusion worth keeping (including "we considered this and are not doing it," or "we confirmed X works this way"), but nothing in the codebase changes as a result.

When to suggest writing a TN: after a research/debate thread converges on a conclusion that isn't captured anywhere else, and there's no resulting code or spec change to hang an ADR off of. Do not write a TN to justify a change that's actually happening now — that's an ADR.

How: copy [docs/notes/TEMPLATE.md](docs/notes/TEMPLATE.md) to `docs/notes/NNNN-kebab-case-title.md` (next sequence number, independent from ADR numbers), fill it in, and add it to the index in [docs/notes/README.md](docs/notes/README.md). If the conclusion later becomes something the project acts on, write an ADR referencing the TN and mark the TN as superseded by it.

## Commit Message Rules

Use Conventional Commits.

Preferred prefixes:

- `feat:` for runtime product behavior.
- `fix:` for bug fixes.
- `docs:` for documentation, specs, task checklists, planning files, and agent instructions.
- `test:` for test-only changes.
- `chore:` for tooling, dependency, formatting, or repository maintenance.
- `refactor:` for code restructuring with no behavior change.

Use `docs:` for documentation-only changes under `docs/`, `specs/`, and `AGENTS.md`, including spec changes and task status updates. Use `chore:` when the change also updates tooling, dependencies, or package scripts.

When completing work that actually changed project files, include one suggested commit message at the end of the final response.
While iterating on the same uncommitted work, update that single suggestion so it reflects the full accumulated change set. Do not replace it with a different message that only describes the latest iteration.
Suggest a new separate commit message only after a commit has been made, or when the user explicitly starts separate work that should be committed independently.
Do not include a commit message suggestion for planning, explanation, review, or advice-only responses with no file changes.
The suggestion must follow these commit message rules.

## API Source Layout (`apps/api/src/`)

```
env.ts                        — Env bindings, HonoEnv (Bindings + Variables), parseEnv
index.ts                      — Hono app, middleware, sub-router, ExportedHandler; notFound checks
                                app.routes for 405 vs 404; queue() consumes both queues (per-message
                                ack/retry): TWITCH_EVENTS_QUEUE → state processing + notification
                                matching, NOTIFICATION_JOBS_QUEUE → Web Push sends; scheduled()
                                dispatches on controller.cron (ADR 0036) — default minutely branch
                                creates pending EventSub subscriptions (ADR 0031)
crons.ts                      — cron expressions for the scheduled jobs, mirrored in wrangler.jsonc's
                                triggers.crons; own module so tests can import them
types.ts                      — queue message contracts (TwitchEventQueueMessage is a discriminated
                                union on eventType, ADR 0032; NotificationJobMessage carries the
                                {title, body, url} payload, ADR 0034) + EventSub event wire shapes
db/
  client.ts                   — drizzle factory (no singleton)
  index.ts                    — Database class (wires all repositories)
  schema.ts                   — Drizzle table definitions
  repositories/
    users.ts                  — UsersRepository
    push-subscriptions.ts     — PushSubscriptionsRepository
    twitch-tokens.ts          — TwitchTokensRepository (encrypted access/refresh tokens;
                                refresh_failed_at flags dead refresh tokens for reconnect, ADR 0036)
    notification-deliveries.ts — NotificationDeliveriesRepository; insertPendingIfNew dedupes on the
                                (user, broadcaster, category, trigger, stream) unique index and
                                returns the row owning the key; statuses pending → sent/failed/
                                skipped (ADRs 0008, 0034)
    followed-channels.ts      — FollowedChannelsRepository
    channel-state.ts          — ChannelStateRepository; inArray queries batch at 100 (D1 limit);
                                updated_from_event_at backs the stale-event guard (ADR 0033)
    channel-state-changes.ts  — ChannelStateChangesRepository; insertIfNew no-ops on duplicate
                                eventsub_message_id (idempotency key, ADR 0033)
    channel-category-preferences.ts — ChannelCategoryPreferencesRepository (soft-disable via
                                disabled_at, revive on re-create; ADR 0029)
    global-category-preferences.ts — GlobalCategoryPreferencesRepository (same lifecycle)
    monitored-channels.ts     — MonitoredChannelsRepository (broadcaster-keyed, soft-disable;
                                ADR 0030)
    eventsub-subscriptions.ts — EventsubSubscriptionsRepository; ensurePending stages local
                                "pending" rows; findPending/markCreated/markVerified/markRevoked
                                drive the status lifecycle (ADR 0031)
http/
  errors.ts                   — ApiError, errorResponse
  response.ts                 — jsonResponse, getRequestId
  middleware/
    auth.ts                   — requireAuth (session cookie → userId + sessionId on context)
  routes/
    health.ts                 — handleHealth
    auth.ts                   — handleAuthStart, handleAuthCallback, handleLogout
    channels.ts               — handleGetFollowedChannels
    categories.ts             — handleSearchCategories (proxies Twitch category search with the
                                user's token)
    preferences.ts            — handleGetPreferences, handleCreate/DeleteChannelPreference,
                                handleCreate/DeleteGlobalPreference; idempotent create,
                                soft-disable delete, monitoring maintenance inline (ADRs 0029–0030)
    me.ts                     — handleGetMe; adds twitch_reconnect_required (dead/missing refresh
                                token, ADR 0036) to the user payload
    push-subscriptions.ts     — handleGetVapidPublicKey, handleCreatePushSubscription (idempotent
                                upsert by endpoint), handleDeletePushSubscription (soft revoke);
                                lifecycle contract in ADR 0027
    sync.ts                   — handleSyncFollows
    webhooks.ts               — handleEventsubWebhook (HMAC verify against raw body, challenge/
                                revocation handling, KV message-id dedupe, enqueue; ADR 0032)
    _tests.ts                  — handleTestReset, handleTestSeed, handleTestInspect (reads
                                broadcaster-keyed monitoring state); test-seam shared by both test
                                tiers (tests/api and tests/web/e2e via tests/shared/seam-client.ts).
                                Only registered on the router at all when environment !== "production"
                                (see index.ts, ADR 0025) — no separate guard/token to bypass
services/
  crypto.ts                   — encryptToken, decryptToken (AES-256-GCM via Web Crypto)
  session.ts                  — createSession, getSession, deleteSession, deleteSessionsForUser,
                                OAuth state helpers
  monitoring.ts               — ensureMonitoredBroadcasters (upsert monitored_channels, stage
                                pending eventsub rows, fill-only channel_state seeding),
                                cleanupMonitoringForBroadcasters (ADR 0030), and
                                eventsubCallbackUrl (reconciliation's ownership marker, ADR 0036)
  eventsub/
    verify.ts                 — verifyEventsubSignature (HMAC-SHA256 over id+timestamp+raw body,
                                constant-time compare; ADR 0032)
    subscriptions.ts          — createPendingEventsubSubscriptions (cron-driven Twitch-side
                                creation of staged pending rows; ADR 0031)
    process.ts                — processTwitchEventMessage (queue consumer logic: stale guard,
                                channel_state upsert, relevant channel_state_changes; ADR 0033);
                                returns the message's change row so matching can run on it
    reconcile.ts              — reconcileEventsubSubscriptions (cron-driven repair of local rows
                                vs Twitch, scoped to this deployment's callback URL; ADR 0036)
  notifications/
    match.ts                  — matchAndCreateDeliveries (per-channel + follower-scoped global
                                preference matching, staged pending deliveries + send jobs;
                                ADRs 0007, 0008, 0034)
    deliver.ts                — deliverNotification (jobs-queue consumer: sends to active push
                                subscriptions, resolves delivery status, revokes 404/410
                                endpoints; ADRs 0034, 0035)
  push/
    web-push.ts               — sendWebPush (RFC 8291 aes128gcm encryption + RFC 8292 VAPID on
                                WebCrypto — the web-push npm package needs Node APIs the Worker
                                lacks and is kept only for its keygen CLI; ADR 0035)
  twitch/
    client.ts                 — TwitchApiError, exchangeCode, getAuthenticatedUser,
                                getAllFollowedChannels, getAllFollowedStreams, searchCategories,
                                getStreamsByUserIds (batched at 100 user_id params),
                                fetchAppAccessToken, createEventsubSubscription,
                                getAllEventsubSubscriptions, deleteEventsubSubscription
    app-token.ts              — getAppAccessToken (client-credentials token, KV-cached; the test
                                seam evicts it on reset so tests mock their own exchange)
    sync.ts                   — syncFollowedChannels (also re-ensures monitoring for users with
                                active global preferences) and syncStaleFollows (cron-driven daily
                                re-sync for global-preference users; ADR 0036)
    token-refresh.ts          — getValidAccessToken (auto-refresh with 5-min buffer) and
                                refreshExpiringTwitchTokens (cron sweep); 4xx refresh failures set
                                twitch_tokens.refresh_failed_at (ADR 0036)
```

## Web Source Layout (`apps/web/src/`)

```
main.tsx                      — React root, QueryClientProvider, BrowserRouter, AuthProvider;
                                registers /service-worker.js (fire-and-forget)
App.tsx                       — route tree (Routes/Route), wraps tabs in AuthGate + AuthenticatedLayout
index.css                     — Tailwind v4 import, theme tokens (CSS custom properties), dark-only theme
context/
  auth-context.tsx            — AuthProvider/useAuth; fetches GET /api/me on mount; user/isLoading/
                                isAuthenticated/refetch/logout
routes/
  authenticated-layout.tsx    — bottom-tab-bar layout wrapping the 3 protected tab routes (<Outlet />)
  login.tsx                   — login screen ("Connect with Twitch" → GET /api/auth/twitch/start)
  channels.tsx, alerts.tsx,   — tab views (T-004); account.tsx also owns the push notification
  account.tsx                   permission/subscription UI (T-005)
components/
  auth-gate.tsx                — AuthGate; single guard for both "authenticated" and "guest" route cases
  bottom-tab-bar.tsx           — persistent 3-tab nav (Channels/Alerts/Account)
  full-screen-loader.tsx       — shared loading state for AuthGate
  ui/                          — shadcn/ui primitives (Button, Sheet, Input, Badge, Avatar); copied source,
                                edit directly, do not treat as an upgradeable dependency
hooks/
  use-session-aware-mutation.ts — useMutation wrapper that marks the session expired on a 401
  use-push-notifications.ts    — push status state machine (checking/unsupported/denied/not-enabled/
                                enabled) + enable/disable flows (T-005, ADR 0027)
  use-channels.ts, use-preferences.ts, use-category-search.ts, use-debounced-value.ts
lib/
  api.ts                       — fetch wrapper (api.get/api.post/api.delete), same-origin via Vite dev proxy
  errors.ts                    — ApiRequestError/ApiErrorBody, matches the API's ADR 0009 error envelope
  push.ts                      — Push API helpers: support detection, SW registration, subscribe,
                                localStorage subscription-id cache, urlBase64ToUint8Array
  utils.ts                     — shadcn's `cn()` helper
types/
  user.ts, push.ts             — mirror apps/api's snake_case fields exactly (not shared/imported
                                across the workspace boundary — see ADR 0028)
public/
  manifest.webmanifest         — static PWA manifest (ADR 0026)
  service-worker.js            — hand-written push/notificationclick-only SW; no fetch handler,
                                no caching (ADR 0026)
```

`@/*` resolves to `apps/web/src/*`. The alias must be declared in **both** `apps/web/tsconfig.json` (root, read by the `shadcn` CLI) and `apps/web/tsconfig.app.json` (read by `tsc`/the editor) — if only one has it, `npx shadcn add <component>` writes files to a literal `./@` directory instead of `src/components/ui/`.

## DB Access Pattern

A fresh `Database` instance is created per request via Hono middleware in `index.ts`:

```ts
app.use("*", (c, next) => {
  c.set("db", new Database(c.env.DB))
  return next()
})
```

Route handlers access it as `c.var.db` (typed via `HonoEnv.Variables`).

Do **not** instantiate `Database` inside route handlers. Do **not** use a module-level singleton.

New repositories go in `db/repositories/<entity>.ts` as a class with `AppDatabase` in the constructor, then get wired into the `Database` class in `db/index.ts`.

## Env Vars: Single Source of Truth

- All dev env vars live at the repo root, not per-app: `.env.development` — committed; safe placeholder values for all secrets. `.env.local` — gitignored; override with real values (e.g., actual `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`). Only these two need real values for OAuth flows; everything else works with the placeholders.
- The zod schema that validates these vars and derives the camelCase `AppConfig` lives in `apps/api/src/env.ts`, same as before — it's the only current consumer, so it isn't split into a shared package. If `apps/web` ever needs validated env vars, give it its own small schema for just its `VITE_`-prefixed vars (same duplication pattern as `types/user.ts`, see ADR 0028) rather than sharing this one.
- Worker config: `apps/api/wrangler.jsonc` (JSONC format, no `wrangler.toml`). The `dev` script points wrangler's `--env-file` flags at the root files (`../../.env.development`, `../../.env.local`); the latter wins on conflicts.
- `apps/web`'s `vite.config.ts` sets `envDir` to the repo root so any future `VITE_`-prefixed vars are read from `.env.development`/`.env.local` and exposed to client code via `import.meta.env` — unprefixed vars (including secrets) are never bundled into the browser build. The `/api` dev proxy target is hardcoded to `http://localhost:8787`, deliberately **not** read from `PUBLIC_URL`: `wrangler dev` and this Vite server always run on the same machine on that fixed port, and `PUBLIC_URL` itself may legitimately differ (e.g. a public tunnel URL so Twitch's OAuth redirect is reachable from another device) — proxying to `PUBLIC_URL` in that case would forward a request back out through the tunnel into this same dev server, an infinite self-loop.
- `PUBLIC_URL` (ADR 0037) is the *one* origin API and web are reachable through, in every environment — there is deliberately no separate API-only URL var. `twitchRedirectUri` is derived in `apps/api/src/env.ts` as `${PUBLIC_URL}${TWITCH_CALLBACK_PATH}` rather than stored as its own var, since the callback path is fixed and must match the route registered in `index.ts`. There is no `EVENTSUB_CALLBACK_URL` var either — the webhook callback URL is derived from `PUBLIC_URL` in `services/monitoring.ts` when pending subscription rows are staged, and stored per row. The post-login redirect (`http/routes/auth.ts`) also lands the browser on `PUBLIC_URL`. Local dev registers the Twitch redirect URI on `:5173` (through the Vite proxy), not `:8787` directly, so this holds even without a tunnel.
- The `/api/__test__/*` routes both test tiers use for state orchestration (see ADR 0025) are only registered on the router when `environment !== "production"` — no env var gates them.
- Both test tiers' `wrangler dev` invocations (`tests/api/setup/global-setup.ts`, `tests/web/e2e/setup/global-setup.ts`) pass only `--env-file .env.development`, never `.env.local`. `.env.local` is gitignored and absent in CI; passing a nonexistent path makes `wrangler dev` exit immediately (surfaced confusingly as vitest's "No test files found"). Tests never do a real OAuth round-trip, so `.env.development`'s placeholders are sufficient — don't add `.env.local` back to these scripts.

## D1 Query Constraints

D1 enforces a maximum of **100 bound parameters per query**. Any `inArray(column, ids)` call where `ids` may exceed 100 must be batched in chunks:

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

SQLite in tests has no such limit, so unbatched queries pass locally and only fail in production.

## Test Tiers

Two independent tiers, each a plain `vitest run` whose `globalSetup` boots and tears down everything it needs (see ADR 0025):

- `tests/api` — real HTTP requests against a `wrangler dev` worker plus an in-process mock Twitch server (`tests/api/setup/`), against throwaway D1/KV state.
- `tests/web/e2e` (and `tests/web/unit`) — Playwright driving a real `wrangler dev` + `vite dev` pair (`tests/web/e2e/setup/`), against the shared dev D1/KV.

Both tiers' `global-setup.ts` share their spawn/readiness/teardown plumbing via `tests/shared/setup/process-lifecycle.ts` — add new process-orchestration logic there, not duplicated per tier. Spawned dev-server output is captured, not printed, so a healthy run shows only vitest's own test output; on a setup failure or an unexpected mid-run exit, the captured output is printed and the run fails immediately (`process.exit(1)`) instead of hanging or timing out test by test.

CI (`.github/workflows/tests.yaml`) runs `api` and `e2e` as separate jobs so the Playwright browser install (`npx playwright install --with-deps chromium`) only happens for the e2e job.

## Lint Config

`eslint.config.mjs`'s `ignores` must cover `**/dist/**` (and any other build-output directory introduced later) with a `**/`-prefixed glob. A minified production bundle (e.g. `apps/web/dist/assets/*.js`, one line of tens of thousands of characters) is pathologically slow for ESLint/Prettier to process — an unignored one causes `npm run lint` to hang for 10+ minutes at 100% CPU with no error output, not a crash. If `lint` ever appears to hang like that, check for an unignored generated/minified file before suspecting an infinite loop in a rule.

## Worktree Configuration

All agents and sub-agents must configure git worktrees under `.agents/worktrees/` to keep temporary worktrees organized and hidden from search and file navigation.

When using git worktree operations (including tools like Gitlens Start Work or Gitlens Start Review):

- Specify the worktree path as `.agents/worktrees/<descriptive-name>` relative to the repository root
- This keeps the workspace clean and prevents cluttering the editor's file explorer and search results
- The `.agents` folder is already excluded in `.vscode/settings.json`
