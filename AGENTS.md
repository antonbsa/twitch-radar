# Project Guidance

## Source Of Truth

For future implementation work, treat [specs/mvp/00. architecture.md](specs/mvp/00.%20architecture.md) as the primary product/system specification.

Decision documentation policy: [ADR 0001](docs/decisions/0001-keep-project-decisions-in-adrs.md).

Non-decision research policy: [ADR 0039](docs/decisions/0039-adopt-technical-notes-for-non-decision-research.md).

## Development Workflow

The expected path from idea to merged change:

1. **Issue.** GitHub issues are the primary spec artifact from milestone 1 onward (ADR 0043): a spec-shaped issue has a problem/motivation, a resolved proposed solution, and acceptance criteria — not just a raw title. When opening an issue via a prompt, it must be assigned a milestone (`gh issue edit --milestone ...` or via `gh issue create`): if the prompt already names one, use it as given; otherwise inspect existing milestones (`gh api repos/{owner}/{repo}/milestones` or the GitHub UI) and suggest the one whose scope fits the issue, or, if none fit, say so and suggest opening a new milestone rather than guessing or leaving it unset.
2. **Spec.** Work is driven directly by that spec-shaped issue, or by a spec-shaped local issue file under `.agents/issues/` if no GitHub issue exists yet. A committed spec document under `specs/milestones/<name>` (see "Spec Location" below) is optional — reach for it only when a milestone-level overview needs to state goals/scope/validation spanning multiple issues at once, not per feature.
3. **Decision changes.** If the issue/spec requires an accepted decision, add or update an ADR per [ADR 0001](docs/decisions/0001-keep-project-decisions-in-adrs.md) before broad coding. Non-decision research/conclusions go in a TN instead (see "ADRs vs Technical Notes" below).
4. **Implementation.** Code the change, committed together with any spec/task updates it completes.
5. **Review and merge.** Open a PR following [creating-pull-requests](.claude/skills/creating-pull-requests) — tests, migrations/config, and specs/ADRs are part of the review, not follow-ups. Apply GitHub labels when opening the PR (`gh pr edit --add-label ...` or via `gh pr create`), not just when explicitly asked: `migration` if it touches `infra/migrations`, `config` if it touches `apps/api/wrangler.jsonc`/`crons.ts`/`env.ts`, plus the applicable default label (`bug`, `enhancement`, `documentation`). These drive the categorized release notes in [.github/release.yml](.github/release.yml) — an unlabeled PR still ships, but silently lands in "Other Changes" instead of the risk-flagged category it belongs in.
6. **Release.** Merging to `main` only deploys preview. Production ships when a GitHub release is published ([ADR 0041](docs/decisions/0041-release-gated-production-deploys.md)); follow [preparing-a-release](.claude/skills/preparing-a-release).

## Spec Location

The MVP spec at `specs/mvp/` is closed to new work. Per ADR 0043, a committed spec document is no longer required per feature — spec-shaped GitHub issues drive milestone 1+ work directly. If a milestone-level overview spanning multiple issues is still useful, it lives under `specs/milestones/<name>`, one directory per milestone, e.g. milestone 0: `specs/milestones/0-foundations`.

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

## Follow-up Changes

A follow-up request against work already in progress or recently implemented - a fix requested after `implementing-a-feature`, a correction asked for directly in chat, a code review comment applied by hand - isn't just a patch to apply and forget. Before finishing a follow-up, classify each item:

- **One-off correction**: fixes this specific instance, doesn't generalize. Apply it and move on.
- **Pattern or convention change**: the fix implies a different approach that should apply project-wide going forward (a naming convention, a code-style rule, a different way of structuring a certain kind of component/handler, a workflow adjustment) - not just this instance.

For anything in the second category, propose persisting it as a standing rule and wait for explicit confirmation before writing it down - don't persist silently, and don't skip proposing it just because the request came from chat rather than a skill. If confirmed, the convention belongs in this file (`AGENTS.md`), in the section matching its topic, or in a subagent's own instructions if it's scoped to that agent's domain (`apps/api`, `apps/web`, infra) - not in an ADR (that's for accepted product/architecture decisions, not process/style convention, per [ADR 0001](docs/decisions/0001-keep-project-decisions-in-adrs.md)) and not under `.agents/` (gitignored scratch space, not project state - see "`.agents/` Directory Scope" below).

This applies regardless of how the follow-up was requested - it is not a step specific to `implementing-a-feature`, `implementation-round`, or any single skill.

## Language

Chat responses (the conversational reply to the user) follow the language the user is writing in for that turn - reply in Portuguese if the user writes in Portuguese, in English if they write in English, etc.

Everything that becomes part of the codebase or project artifacts is always written in English, regardless of the chat language: code, identifiers, comments, commit messages, document content, and issue/PR titles and descriptions.

## Code Comments

Comments are for the future reader - human or agent - who already has the code in front of them. Don't repeat what the code says.

Write a comment when:

- the "why" isn't derivable from the code itself (a business rule, a third-party bug/limitation, a performance trade-off, a legal/legacy constraint)
- there's a pitfall: something that looks safe to simplify but breaks if changed
- an invariant or precondition isn't expressed by the type/signature
- it points to an external reference worth following: an ADR, issue, RFC, or API doc

Don't write:

- narration of control flow ("now we iterate over the list", "first we validate...")
- change history ("changed from X to Y", "used to be a callback")
- discarded-alternative rationale in prose - that belongs in the commit message or PR description, not the file
- decorative section banners, or a TODO with no linked issue
- a restatement of an already-self-explanatory function/variable name

Where design rationale lives depends on how durable it is:

- Alternatives considered and why they were dropped for _this specific change_: the commit message or PR description - they carry context, a date, and an author.
- A decision the codebase is expected to keep following: an ADR under `docs/decisions/` (per ADR 0001), referenced inline with a one-line pointer (e.g. `// ... (ADR 0033)`) rather than restated in prose.

An outdated narrative comment is worse than no comment - it actively misleads, for a human and an agent grepping for context alike.

Format:

- JSDoc on a function whose contract isn't obvious from its signature: purpose, side effects, and behavior that the types don't already express. Include `@param`/`@returns` only when a parameter or the return value carries meaning the signature alone doesn't (a unit, an encoding, a sentinel value) - skip them when they'd just restate the name and type. Reserve JSDoc for functions where the complexity or contract actually warrants it; a small, low-usage helper with an obvious signature doesn't need one.
- Inline: 1-2 lines, directly above the relevant line.

When touching existing code, preserve "why" comments that still hold. If the code a comment describes changed, update or remove the comment - never let it drift. Note in your summary when you remove a pre-existing comment.

If a block needs long prose to explain itself, prefer extracting a function with a descriptive name instead.

## Markdown Prose Formatting

Do not hard-wrap prose paragraphs in markdown files at a fixed column width. Each paragraph is one line, however long — let the editor/terminal soft-wrap it for display. This applies to prose only, not to fenced code blocks, tables, or list-item continuation lines, which keep their own formatting rules.

`prettier.config.mjs` enforces this with a `*.md` override (`proseWrap: "never"`), so `npx prettier --write <file>.md` reflows an already hard-wrapped file back to one line per paragraph.

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

When completing work that actually changed project files, include one suggested commit message at the end of the final response. While iterating on the same uncommitted work, update that single suggestion so it reflects the full accumulated change set. Do not replace it with a different message that only describes the latest iteration. Suggest a new separate commit message only after a commit has been made, or when the user explicitly starts separate work that should be committed independently. Do not include a commit message suggestion for planning, explanation, review, or advice-only responses with no file changes. The suggestion must follow these commit message rules.

Include the `Co-Authored-By` trailer (per the attribution instructions given in-session) only when the agent decided and wrote the change end-to-end with no direct dictation from the user - e.g. autonomous follow-through inside a skill like `implementation-round`. Omit it when the user reviewed the change directly or gave the specific implementation instruction that produced it - the common case in an interactive session - since that work isn't independently agent-authored.

This criterion applies to commits only. Pull request descriptions never carry a "Generated with Claude Code" line or equivalent, regardless of how the work was authored - `.claude/settings.json` sets `attribution.pr` to an empty string to enforce this at the tool level rather than relying on remembering it per PR.

## API Contract Doc

[docs/api-contract.md](docs/api-contract.md) documents `apps/api`'s HTTP surface: auth convention, the error envelope, the idempotent-create/soft-disable-delete pattern, and an endpoint index. It's transversal-convention-level, not a field-by-field spec — request/response shapes stay in the route file itself, referenced from there rather than duplicated. Update it in the same change when adding, removing, or renaming a route, or changing the auth/error/idempotency convention it describes; a change confined to a route's internal logic (no shape/convention change) doesn't need it touched. Read the actual route/schema when the detail matters - this doc is a starting map, not an authority over the code.

## Internationalization (i18n)

All user-visible frontend text goes through the i18n catalog (ADR 0044) - never a hardcoded string in JSX, a `placeholder`/`aria-label`/`title` attribute, or a toast/error message shown to the user. Add a key to `apps/web/public/locales/en.json` and resolve it via `useLanguage().t()` (or `interpolateNodes` from `lib/i18n-react.tsx` when the text needs embedded JSX, e.g. bolding a name).

The three catalogs (`en.json`, `es.json`, `pt-BR.json`) are kept in lockstep - a key added to `en.json` without matching entries in the other two is a silent bug (the string falls back to the raw key or the `en` text for those locales), not a partial rollout to fix later.

This extends past the React app: the service worker (`apps/web/public/service-worker.js`) and the backend (`NotificationJobMessage`'s `{titleKey, bodyKey, params, lang}`, ADR 0044) also pass around catalog keys, not literal text - a hook or handler that resolves user-facing text should return a key for its caller to look up, not the resolved string, unless it's the one place actually rendering it.

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
- `PUBLIC_URL` (ADR 0037) is the _one_ origin API and web are reachable through, in every environment — there is deliberately no separate API-only URL var. `twitchRedirectUri` is derived in `apps/api/src/env.ts` as `${PUBLIC_URL}${TWITCH_CALLBACK_PATH}` rather than stored as its own var, since the callback path is fixed and must match the route registered in `index.ts`. There is no `EVENTSUB_CALLBACK_URL` var either — the webhook callback URL is derived from `PUBLIC_URL` in `services/monitoring.ts` when pending subscription rows are staged, and stored per row. The post-login redirect (`http/routes/auth.ts`) also lands the browser on `PUBLIC_URL`. Local dev registers the Twitch redirect URI on `:5173` (through the Vite proxy), not `:8787` directly, so this holds even without a tunnel.
- The `/api/__test__/*` routes both test tiers use for state orchestration (see ADR 0025) are only registered on the router when `environment !== "production"` — no env var gates them.
- Both test tiers' `wrangler dev` invocations (`tests/api/setup/global-setup.ts`, `tests/web/e2e/setup/global-setup.ts`) pass only `--env-file .env.development`, never `.env.local`. `.env.local` is gitignored and absent in CI; passing a nonexistent path makes `wrangler dev` exit immediately (surfaced confusingly as vitest's "No test files found"). Tests never do a real OAuth round-trip, so `.env.development`'s placeholders are sufficient — don't add `.env.local` back to these scripts.
- **Never delete, move, rename, or overwrite any root `.env.*` file holding real secrets in the main worktree** — this covers `.env.local` and `.env.production` (the latter is the developer's manual scratch copy of the values pushed via `wrangler secret put`; nothing in the repo reads it directly, but it's the only record of those production secrets) — whether directly or via a broad/destructive command (`git clean`, `rm -rf`, a "reset the repo to a clean state" request, etc.). These hold real secrets (`TWITCH_CLIENT_SECRET`, VAPID keys, `TOKEN_ENCRYPTION_KEY`, `EVENTSUB_WEBHOOK_SECRET`, `CLOUDFLARE_API_TOKEN`) that exist nowhere else in the repo or its history — being gitignored (`.env.*` in `.gitignore`, with only `.env.development` un-ignored), there is no commit to recover them from. Deleting `.env.local` also silently breaks `npm run dev` for every worktree (`infra/scripts/dev/api-dev.mjs` reads it live via `git rev-parse --git-common-dir`, so all worktrees share this one file), and the loss is only discovered later, disconnected from whatever action caused it. If a task seems to call for touching any of these files, stop and confirm with the user first instead of acting.

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

## D1 Debug Queries

For a debugging question ("check whether X row exists", "what's the current state of Y") don't tell the user to run a query - run it yourself and report the result. The local dev D1 database is reachable from the repo root:

```bash
cd apps/api && npx wrangler d1 execute twitch-radar-dev --local --command "SELECT * FROM notification_snoozes WHERE user_id = '...'"
```

Table names are the `sqliteTable("...", ...)` calls in [apps/api/src/db/schema.ts](apps/api/src/db/schema.ts) - check there rather than guessing a table name from a repository or type name, since not every one maps 1:1 (e.g. the `channelStateChanges` repository backs `channel_state_changes`, but check schema.ts instead of assuming a pattern holds for a table you haven't looked up yet).

Read-only queries (`SELECT`) run without asking. A query that mutates data (`INSERT`, `UPDATE`, `DELETE`, `DROP`, or anything altering schema/rows - including "seed a test row" or "reset this field to test X") requires explicit confirmation first, every time, even against local dev state - say what the query does and what it targets before running it.

Never target `twitch-radar-dev` without `--local`, and never run `wrangler d1 execute` against a remote/production database from an agent session.

`.claude/settings.json` allow-lists this exact command shape when `--command` starts with `SELECT`, so a query written this way runs without a permission prompt - everything else (including any mutation) falls through to the default prompt. That's a plain string-prefix match, not a SQL parser: it only recognizes a query that both starts with `SELECT` and is invoked exactly as shown above (from the repo root, `cd apps/api &&` prefix, `--local` before `--command`). Don't rely on it to distinguish read from write in any other invocation shape - the mutation-confirmation rule above still governs.

## Migration Collision on Rebase

`wrangler d1 migrations apply` tracks what's applied by **filename**, in a `d1_migrations` table - not by content. If two branches each generate a migration with the same number (e.g. both produce `0006_*.sql`), only one can keep that number once both land on `main`; the other must be regenerated with the next free number during rebase.

Only one branch should generate a migration at a time. If a branch's migration would collide with one that landed on `main` first, rebase onto `main`, delete that branch's own `.sql` file and its `meta/<n>_snapshot.json`, and run `migrations:create` again on top of the now-merged baseline - this is the only way to keep the snapshot chain correct. Don't hand-renumber the file or edit the journal to "fix" the collision.

`npm run db:check -w @twitch-radar/api` (`drizzle-kit check`) detects this exact numbering/journal collision, and runs in CI (`.github/workflows/linting.yaml`) on every push/PR - but run it yourself after any rebase that touched `infra/migrations` too, rather than waiting to find out from CI. Treat a failure as this problem, not a flaky check.

If your local D1 already has the old filename recorded as applied before you catch the collision, `db:setup` will try to re-run the migration under its new name and fail (typically `duplicate column name: ... : SQLITE_ERROR`, or the equivalent for whatever the migration added). Fix locally without losing dev data by repointing the tracking row at the new filename:

```bash
cd apps/api
npx wrangler d1 execute twitch-radar-dev --local \
  --command "UPDATE d1_migrations SET name = '<new_filename>.sql' WHERE name = '<old_filename>.sql'"
```

Then `npm run db:setup` should report "No migrations to apply!" (or apply only the genuinely new ones). If reconciling isn't worth it, deleting `apps/api/.wrangler/state/v3/d1` and rerunning `npm run db:setup` also works, but wipes local sessions and synced channel data.

## Test Tiers

Two independent tiers, each a plain `vitest run` whose `globalSetup` boots and tears down everything it needs (see ADR 0025):

- `tests/api` — real HTTP requests against a `wrangler dev` worker plus an in-process mock Twitch server (`tests/api/setup/`), against throwaway D1/KV state.
- `tests/web/e2e` (and `tests/web/unit`) — Playwright driving a real `wrangler dev` + `vite dev` pair (`tests/web/e2e/setup/`), against the shared dev D1/KV.

Both tiers' `global-setup.ts` share their spawn/readiness/teardown plumbing via `tests/shared/setup/process-lifecycle.ts` — add new process-orchestration logic there, not duplicated per tier. Spawned dev-server output is captured, not printed, so a healthy run shows only vitest's own test output; on a setup failure or an unexpected mid-run exit, the captured output is printed and the run fails immediately (`process.exit(1)`) instead of hanging or timing out test by test.

CI (`.github/workflows/tests.yaml`) runs `api` and `e2e` as separate jobs so the Playwright browser install (`npx playwright install --with-deps chromium`) only happens for the e2e job.

## Test Execution Scope

Both test tiers are already enforced by CI on every push/PR (`.github/workflows/tests.yaml`) - re-running a full tier is not what confirms a change is ready to ship, and each run pays the tier's full `globalSetup` cost (`wrangler dev`, and for `tests/web/e2e`, Playwright too). Don't run a full tier after every small edit.

- During a small iteration (a single fix, a tweak to one file): run only the test(s) related to what changed, filtered by file and/or name:
  ```bash
  npx vitest run --config vitest.config.ts tests/api/notifications.test.ts -t "snooze"
  npx vitest run --config vitest.e2e.config.ts tests/web/e2e/alerts.spec.ts
  ```
  Filtering by name/file cuts test count but not the tier's setup cost - it's for fast feedback on the specific behavior you're touching, not a cheap substitute for the full suite.
- After a large chunk of work lands (the first full pass at a feature/refactor, or any change with a wide blast radius): run the full relevant tier(s) once.
- Before opening a PR: don't re-run the suites just for that - CI already will, and it was very likely already run at the "large chunk of work" checkpoint above. Follow `creating-pull-requests` for how to represent verification status; don't re-run tests as a checklist formality.

## Lint Config

`eslint.config.mjs`'s `ignores` must cover `**/dist/**` (and any other build-output directory introduced later) with a `**/`-prefixed glob. A minified production bundle (e.g. `apps/web/dist/assets/*.js`, one line of tens of thousands of characters) is pathologically slow for ESLint/Prettier to process — an unignored one causes `npm run lint` to hang for 10+ minutes at 100% CPU with no error output, not a crash. If `lint` ever appears to hang like that, check for an unignored generated/minified file before suspecting an infinite loop in a rule.

## Pre-commit Hook

`husky` is wired via the root `package.json` `prepare` script, so hooks install automatically after `npm install`. `.husky/pre-commit` runs `npx lint-staged` (config in `lint-staged.config.mjs`), which lints and formats only staged files and runs each workspace's `typecheck` only when that workspace has staged `.ts`/`.tsx` files. `lint-staged` stashes unstaged changes before running and restores them after, so dirty-but-unstaged files in the working tree are never considered and never block a commit — only what's actually staged is checked.

This hook is a **local convenience for fast feedback only, not an enforcement mechanism** — it can be bypassed with `git commit --no-verify` (a viable, documented escape hatch, e.g. for WIP commits), and it isn't run at all if someone commits without ever running `npm install` in this repo. The actual enforced check remains CI (`.github/workflows/linting.yaml`, `.github/workflows/tests.yaml`) on every push/PR - `linting.yaml` runs eslint/prettier, a full-workspace `typecheck`, and `db:check` (the D1 migration-collision detector, see "Migration Collision on Rebase") as separate parallel jobs, alongside `tests.yaml`'s `tests/api`/`tests/web` suites. This distinction matters here because this is a private repo on GitHub's free plan, so classic branch protection on `main` isn't available — nothing server-side currently gates a broken commit from landing on `main`, CI only reports after the fact. The hook exists to shorten the local feedback loop given that gap, not to replace CI as the source of truth. There is deliberately no pre-push hook: the full API/E2E suite is too slow for interactive use (spins up `wrangler dev`, and for E2E, Playwright + a browser install) and stays CI-only.

## `.agents/` Directory Scope

`.agents/` (gitignored, not part of the repo) is a local scratch space for drafts and internal validation - issue drafts, follow-up notes, worktrees. Its contents are not project state: they're leftovers from past iterations, not something every agent needs to track. Do not read, summarize, or factor in anything under `.agents/` unless a task explicitly points you at a specific file in it (e.g. the user references an issue draft by path). Never treat its presence or content as informing unrelated work, and never assume it reflects current decisions - those live in `docs/decisions`, `docs/notes`, and `specs/`.

## Worktree Configuration

All agents and sub-agents must configure git worktrees under `.agents/worktrees/` to keep temporary worktrees organized and hidden from search and file navigation.

When using git worktree operations (including tools like Gitlens Start Work or Gitlens Start Review):

- Specify the worktree path as `.agents/worktrees/<descriptive-name>` relative to the repository root
- This keeps the workspace clean and prevents cluttering the editor's file explorer and search results
- The `.agents` folder is already excluded in `.vscode/settings.json`
- Name the branch succinctly after what the work actually is (e.g. `oauth-cancel-callback`, `reconnect-required-signal`, `adr-async-follow-sync-progress`) — do not prefix with `issue-<n>` and do not use a generic name like `agent-<id>` or `worktree-<id>`
- The worktree directory name must match the branch name (`.agents/worktrees/<branch-name>`), not a generic agent/task identifier
