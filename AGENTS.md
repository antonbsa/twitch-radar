# Project Guidance

## Project Map

- Monorepo: `apps/api` (Hono on Cloudflare Workers), `apps/web` (React/Vite PWA), `infra` (D1 migrations, scripts), `tests/{api,web}`.
- Package-specific rules live in nested files, loaded when you work there: [apps/api/AGENTS.md](apps/api/AGENTS.md), [apps/web/AGENTS.md](apps/web/AGENTS.md), [infra/AGENTS.md](infra/AGENTS.md), [tests/web/AGENTS.md](tests/web/AGENTS.md).
- Decisions: `docs/decisions` (ADRs, [ADR 0001](docs/decisions/0001-keep-project-decisions-in-adrs.md)). Research conclusions: `docs/notes` (TNs, [ADR 0039](docs/decisions/0039-adopt-technical-notes-for-non-decision-research.md)). HTTP surface: [docs/api-contract.md](docs/api-contract.md).
- Where guidance goes: needed on most edits → this file; scoped to a directory → that directory's `AGENTS.md` (plus a `CLAUDE.md` containing `@AGENTS.md`); a procedure needed for one task only and longer than ~15 lines → `docs/<topic>.md`, linked from the nearest `AGENTS.md` with its trigger ("Before X, read Y"); a decision → ADR. Re-check placement when a section grows or its trigger changes.
- `specs/mvp/00. architecture.md` is background reference for the product/system; the MVP spec is closed to new work.

## Workflow

Issue → ADR/TN if a decision changes → implementation → PR → release.

1. **Issue.** Spec-shaped GitHub issues are the source of truth for milestone 1+ work (ADR 0043): problem/motivation, a resolved proposed solution, acceptance criteria. Every issue needs a milestone: use the one the prompt names, else pick the best fit from `gh api repos/{owner}/{repo}/milestones`, or say none fits and suggest a new one. Without a GitHub issue, a spec-shaped file under `.agents/issues/` works. A milestone overview under `specs/milestones/<name>` is optional, only when several issues need shared goals/scope.
2. **Decision.** If the work needs an accepted decision, add or update an ADR before broad coding. Research that changes nothing goes in a TN (see below).
3. **Implement** via [implementing-a-feature](.claude/skills/implementing-a-feature), committed together with the spec/task updates it completes.
4. **PR** via [creating-pull-requests](.claude/skills/creating-pull-requests): tests, migrations/config and specs/ADRs are part of the review. The skill owns the labels rule.
5. **Release** via [preparing-a-release](.claude/skills/preparing-a-release). Merging to `main` only deploys preview; production ships when a release is published ([ADR 0041](docs/decisions/0041-release-gated-production-deploys.md)).

## ADRs vs Technical Notes

- ADR: an accepted decision the code is expected to reflect. Use it when a change is being made or has been made.
- TN: a researched conclusion that is not an action (including "we considered this and are not doing it"). Suggest one when a thread converges and nothing else captures it. Never write a TN to justify a change that is happening now.
- TN procedure: [docs/notes/README.md](docs/notes/README.md).

## Follow-up Changes

Before finishing a follow-up to work in progress (chat fix, review comment applied by hand), classify each item:

- One-off correction: apply it and move on.
- Pattern or convention change (applies project-wide from now on): propose persisting it and wait for explicit confirmation. If confirmed, it goes in the matching section of the relevant `AGENTS.md` or a subagent's instructions, not in an ADR ([ADR 0001](docs/decisions/0001-keep-project-decisions-in-adrs.md)) and not under `.agents/`.

## Language

- Chat replies follow the language the user writes in that turn.
- Everything that becomes part of the codebase or project artifacts is English: code, identifiers, comments, commits, docs, issue/PR titles and descriptions.

## Code Comments

Write a comment when:

- the "why" isn't derivable from the code (business rule, third-party bug, performance trade-off, legal/legacy constraint)
- there's a pitfall that looks safe to simplify but breaks
- an invariant isn't expressed by the type or signature
- an external reference is worth following (ADR, issue, RFC, API doc)

Keep them short: inline is 1-2 lines above the relevant line. JSDoc only when the contract isn't obvious from the signature; add `@param`/`@returns` only for meaning the types don't carry (a unit, an encoding, a sentinel).

- A durable decision gets a one-line ADR pointer, e.g. `// ... (ADR 0033)`. Alternatives considered for one change go in the commit message or PR.
- Preserve "why" comments that still hold. Update or remove ones the code outgrew, and say so in your summary.
- If a block needs long prose, extract a well-named function instead.

## Commits

- Conventional Commits: `feat:` runtime behavior, `fix:` bug fixes, `docs:` docs/specs/task checklists/agent instructions, `test:` test-only, `chore:` tooling/deps/formatting/maintenance, `refactor:` restructuring without behavior change. If a change touches both docs and tooling or scripts, use `chore:`.
- Subject: imperative, ≤72 chars, no trailing period; it must stand alone in `git log --oneline`.
- Body is optional; skip it when the subject says everything. When present: 1–4 `- ` bullets, one line each, no hard wrap. Each says why or what's non-obvious (constraint, rejected alternative, side effect), never a file-by-file how.
- Context that has a home elsewhere (incident history, design rationale) stays in its issue/ADR/PR; the commit points to it in a footer (`Refs: #73, ADR 0049`) instead of retelling it.
- Merge commits: subject only, plus one bullet if resolving conflicts required a non-obvious choice.
- When your work changed project files, end the final response with one suggested commit message. While iterating on the same uncommitted work, update that single suggestion to cover the whole change set; start a new one only after a commit or when separate work begins. Skip it for advice-only responses.
- `Co-Authored-By` trailer: only on commits a skill makes autonomously (e.g. `implementation-round`); never on interactive work the user directed or reviewed. PR descriptions never carry attribution (`attribution.pr` enforces it).

## Markdown

Don't hard-wrap prose: one paragraph, one line (`npx prettier --write <file>.md` enforces `proseWrap: never`). Fenced code, tables and list continuations keep their own formatting.

## Env Vars

- Dev env vars live at the repo root, not per-app: `.env.development` (committed, placeholder secrets) and `.env.local` (gitignored, real values; only `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET` need real ones for OAuth). The zod schema is `apps/api/src/env.ts` ([apps/api/AGENTS.md](apps/api/AGENTS.md)).
- Never delete, move, rename or overwrite a root `.env.*` file holding real secrets (`.env.local`, `.env.production`) in the main worktree, directly or via `git clean`/`rm -rf`/"reset to clean". They exist nowhere else, and `.env.local` is read live by every worktree's `npm run dev`. The settings deny the obvious paths; if a task seems to need one, stop and ask.
- `PUBLIC_URL` is the single origin API and web are reachable through, in every environment ([ADR 0037](docs/decisions/0037-single-public-url-same-origin-deployment.md)). `twitchRedirectUri` and the EventSub callback URL are derived from it, not separate vars.
- `wrangler dev --env <preview|production> --remote` binds local-dev values to a shared remote D1/KV and writes bad data into it (issue #73). Use `npm run dev:remote`; see [docs/deployment.md](docs/deployment.md) "Hazard: `wrangler dev --remote` Against A Shared Environment".
- Both test tiers pass only `--env-file .env.development` to `wrangler dev`, never `.env.local`: it's absent in CI, and a nonexistent path makes wrangler exit at once (surfacing as vitest's "No test files found"). Don't add it back.
- `/api/__test__/*` routes exist only when `environment !== "production"` (ADR 0025).

## Engineering

- Build the simplest thing that fully meets the current requirement, end to end; add capability on top of something that already works. No speculative abstractions, config or indirection.
- Small is fine, throwaway isn't: the simplest version should be one you'll extend, not one you'll replace. Don't accept a stopgap meant to be rewritten later.
- Before writing your own code: use what the project's dependencies already offer (check their docs and types before assuming a gap), then a well-maintained library; adding a dependency needs a reason.
- For a design with no precedent in the codebase, look at how established products solve it and follow their conventions instead of inventing one.

## No Backward-Compatibility Code (Pre-launch)

Don't add code that only accepts old schema/data states. When a schema or format changes, update existing records in the same change (a backfill `UPDATE` in the migration) so every environment converges and the new invariant is the only supported state. This doesn't apply to fields that are legitimately optional going forward. Revisit once the app has real users.

## Tests

- `tests/api`: real HTTP against a `wrangler dev` worker plus an in-process mock Twitch server, on throwaway D1/KV. `tests/web/e2e` (and `tests/web/unit`): Playwright against `wrangler dev` + `vite dev` on the shared dev D1/KV. Each tier is a plain `vitest run` whose `globalSetup` boots and tears everything down (ADR 0025).
- New process-orchestration logic goes in `tests/shared/setup/process-lifecycle.ts`, not duplicated per tier. Setup failures print the captured server output and exit 1.
- CI (`.github/workflows/tests.yaml`) runs both tiers on every push/PR, so don't run a full tier after every small edit; each run pays the full `globalSetup` cost. Iterate with a file/name filter:
  ```bash
  npx vitest run --config vitest.config.ts tests/api/notifications.test.ts -t "snooze"
  npx vitest run --config vitest.e2e.config.ts tests/web/e2e/alerts.spec.ts
  ```
- Run each affected full tier once after a large chunk of work. Don't re-run before opening a PR just as a formality.
- The tiers use fixed ports, distinct from dev's. Another worktree's run holding them is contention, not your bug: leave other sessions' servers running.

## Tooling

- When the pre-commit hook (`husky` + `lint-staged`) fails, fix the reported cause and commit again.
- `eslint.config.mjs` `ignores` must keep `**/dist/**`: an unignored minified bundle makes `npm run lint` hang for 10+ minutes with no error.

## Worktrees and `.agents/`

- Create worktrees at `.agents/worktrees/<branch-name>`, with the directory name matching the branch. Name the branch after the work (`oauth-cancel-callback`), with no `issue-<n>` prefix and no generic `agent-<id>`.
- A fresh worktree needs `npm install` at its root before anything runs.
- `.agents/` is gitignored scratch space (drafts, worktrees), not project state. Don't read or factor in its contents unless a task points at a specific file; real decisions live in `docs/decisions`, `docs/notes` and `specs/`.
