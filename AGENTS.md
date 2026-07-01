# Project Guidance

## Source Of Truth

For future implementation work, treat [specs/mvp/00. architecture.md](specs/mvp/00.%20architecture.md) as the primary product/system specification.

Decision documentation policy: [ADR 0001](docs/decisions/0001-keep-project-decisions-in-adrs.md).

## Scope Boundary

The proof-of-concept files and docs are historical Web Push validation material. MVP work should follow the active MVP spec and accepted ADRs.

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
    sync.ts                   — handleSyncFollows
services/
  crypto.ts                   — encryptToken, decryptToken (AES-256-GCM via Web Crypto)
  session.ts                  — createSession, getSession, deleteSession, OAuth state helpers
  twitch/
    client.ts                 — TwitchApiError, exchangeCode, getAuthenticatedUser,
                                getAllFollowedChannels, getAllFollowedStreams
    sync.ts                   — syncFollowedChannels
    token-refresh.ts          — getValidAccessToken (auto-refresh with 5-min buffer)
```

## DB Access Pattern

A fresh `Database` instance is created per request via Hono middleware in `index.ts`:

```ts
app.use("*", (c, next) => {
  c.set("db", new Database(c.env.DB));
  return next();
});
```

Route handlers access it as `c.var.db` (typed via `HonoEnv.Variables`).

Do **not** instantiate `Database` inside route handlers. Do **not** use a module-level singleton.

New repositories go in `db/repositories/<entity>.ts` as a class with `AppDatabase` in the constructor, then get wired into the `Database` class in `db/index.ts`.

## Wrangler Config and Local Env

- Worker config: `apps/api/wrangler.jsonc` (JSONC format, no `wrangler.toml`).
- `apps/api/.dev.vars` — committed; safe placeholder values for all secrets.
- `apps/api/.dev.vars.local` — gitignored; override with real values (e.g., actual `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`). The `dev` script loads both files; `.dev.vars.local` wins on conflicts.
- Only `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` need real values for OAuth flows; everything else works with the placeholders.

## D1 Query Constraints

D1 enforces a maximum of **100 bound parameters per query**. Any `inArray(column, ids)` call where `ids` may exceed 100 must be batched in chunks:

```ts
const BATCH_SIZE = 100
for (let i = 0; i < ids.length; i += BATCH_SIZE) {
  const rows = await db.select().from(table)
    .where(inArray(col, ids.slice(i, i + BATCH_SIZE))).all()
  results.push(...rows)
}
```

SQLite in tests has no such limit, so unbatched queries pass locally and only fail in production.

## Worktree Configuration

All agents and sub-agents must configure git worktrees under `.agents/worktrees/` to keep temporary worktrees organized and hidden from search and file navigation.

When using git worktree operations (including tools like Gitlens Start Work or Gitlens Start Review):

- Specify the worktree path as `.agents/worktrees/<descriptive-name>` relative to the repository root
- This keeps the workspace clean and prevents cluttering the editor's file explorer and search results
- The `.agents` folder is already excluded in `.vscode/settings.json`
