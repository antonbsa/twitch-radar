# Project Guidance

## Source Of Truth

For future implementation work, treat [specs/mvp/00. architecture.md](specs/mvp/00.%20architecture.md) as the primary product/system specification.

Decision documentation policy: [ADR 0001](docs/decisions/0001-keep-project-decisions-in-adrs.md).

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
                                app.routes for 405 vs 404
db/
  client.ts                   — drizzle factory (no singleton)
  index.ts                    — Database class (wires all repositories)
  schema.ts                   — Drizzle table definitions
  repositories/
    users.ts                  — UsersRepository
    push-subscriptions.ts     — PushSubscriptionsRepository
    twitch-tokens.ts          — TwitchTokensRepository (encrypted access/refresh tokens)
    followed-channels.ts      — FollowedChannelsRepository
    channel-state.ts          — ChannelStateRepository; inArray queries batch at 100 (D1 limit)
http/
  errors.ts                   — ApiError, errorResponse
  response.ts                 — jsonResponse, getRequestId
  middleware/
    auth.ts                   — requireAuth (session cookie → userId + sessionId on context)
  routes/
    health.ts                 — handleHealth
    auth.ts                   — handleAuthStart, handleAuthCallback, handleLogout
    channels.ts               — handleGetFollowedChannels
    me.ts                     — handleGetMe
    push-subscriptions.ts     — handleGetVapidPublicKey, handleCreatePushSubscription (idempotent
                                upsert by endpoint), handleDeletePushSubscription (soft revoke);
                                lifecycle contract in ADR 0027
    sync.ts                   — handleSyncFollows
    _tests.ts                  — handleTestReset, handleTestSeed; test-seam shared by both test
                                tiers (tests/api and tests/web/e2e via tests/shared/seam-client.ts).
                                Only registered on the router at all when environment !== "production"
                                (see index.ts, ADR 0025) — no separate guard/token to bypass
services/
  crypto.ts                   — encryptToken, decryptToken (AES-256-GCM via Web Crypto)
  session.ts                  — createSession, getSession, deleteSession, deleteSessionsForUser,
                                OAuth state helpers
  twitch/
    client.ts                 — TwitchApiError, exchangeCode, getAuthenticatedUser,
                                getAllFollowedChannels, getAllFollowedStreams
    sync.ts                   — syncFollowedChannels
    token-refresh.ts          — getValidAccessToken (auto-refresh with 5-min buffer)
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
- `apps/web`'s `vite.config.ts` sets `envDir` to the repo root and uses Vite's `loadEnv` to read `API_URL` for the dev proxy target (Node-side config only, not bundled). Any future `VITE_`-prefixed vars would also be read from `.env.development`/`.env.local` and exposed to client code via `import.meta.env` — unprefixed vars (including secrets) are never bundled into the browser build.
- `API_URL` is the API Worker's own base URL (renamed from `PUBLIC_BASE_URL` to make that explicit); `twitchRedirectUri` is derived in `apps/api/src/env.ts` as `${API_URL}${TWITCH_CALLBACK_PATH}` rather than stored as its own var, since the callback path is fixed and must match the route registered in `index.ts`. `EVENTSUB_CALLBACK_URL` was removed (unused until T-007 implements EventSub subscriptions) — derive it the same way from `API_URL` when that lands.
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
