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
5. **Review and merge.** Open a PR following [creating-pull-requests](.claude/skills/creating-pull-requests) — tests, migrations/config, and specs/ADRs are part of the review, not follow-ups. Apply GitHub labels when opening the PR (`gh pr edit --add-label ...` or via `gh pr create`), not just when explicitly asked: `migration` if it touches `infra/migrations`, `config` if it touches `apps/api/wrangler.jsonc`/`crons.ts`/`env.ts`, plus the applicable default label (`bug`, `enhancement`, `documentation`). These drive the categorized release notes in [.github/release.yml](.github/release.yml) — an unlabeled PR still ships, but silently lands in "Other Changes" instead of the risk-flagged category it belongs in.
6. **Release.** Merging to `main` only deploys preview. Production ships when a GitHub release is published ([ADR 0041](docs/decisions/0041-release-gated-production-deploys.md)); follow [preparing-a-release](.claude/skills/preparing-a-release).

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

## Language

Chat responses (the conversational reply to the user) follow the language the user is writing in for that turn - reply in Portuguese if the user writes in Portuguese, in English if they write in English, etc.

Everything that becomes part of the codebase or project artifacts is always written in English, regardless of the chat language: code, identifiers, comments, commit messages, document content, and issue/PR titles and descriptions.

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

File map for the Worker backend: [docs/agents/api-source-layout.md](docs/agents/api-source-layout.md). Read it when working inside `apps/api/src`.

## Web Source Layout (`apps/web/src/`)

File map for the React/Vite PWA frontend: [docs/agents/web-source-layout.md](docs/agents/web-source-layout.md). Read it when working inside `apps/web/src`.

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

## Pre-commit Hook

`husky` is wired via the root `package.json` `prepare` script, so hooks install automatically after `npm install`. `.husky/pre-commit` runs `npm run lint && npm run typecheck`.

This hook is a **local convenience for fast feedback only, not an enforcement mechanism** — it can be bypassed with `git commit --no-verify` (a viable, documented escape hatch, e.g. for WIP commits), and it isn't run at all if someone commits without ever running `npm install` in this repo. The actual enforced check remains CI (`.github/workflows/linting.yaml`, `.github/workflows/tests.yaml`) on every push/PR. This distinction matters here because this is a private repo on GitHub's free plan, so classic branch protection on `main` isn't available — nothing server-side currently gates a broken commit from landing on `main`, CI only reports after the fact. The hook exists to shorten the local feedback loop given that gap, not to replace CI as the source of truth. There is deliberately no pre-push hook: the full API/E2E suite is too slow for interactive use (spins up `wrangler dev`, and for E2E, Playwright + a browser install) and stays CI-only.

## Worktree Configuration

All agents and sub-agents must configure git worktrees under `.agents/worktrees/` to keep temporary worktrees organized and hidden from search and file navigation.

When using git worktree operations (including tools like Gitlens Start Work or Gitlens Start Review):

- Specify the worktree path as `.agents/worktrees/<descriptive-name>` relative to the repository root
- This keeps the workspace clean and prevents cluttering the editor's file explorer and search results
- The `.agents` folder is already excluded in `.vscode/settings.json`
