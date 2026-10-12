# Engineering Process

How the project itself is run. This is as much a part of what the repository is meant to show as the product, and it is a summary: the rules live in the [`AGENTS.md`](../../AGENTS.md) files, the skills and the ADRs linked below, and this page doesn't copy them. Part of the [architecture overview](overview.md).

## Work Starts From A Spec-Shaped Issue

A GitHub issue with a problem statement, a resolved solution and acceptance criteria is enough to implement from, with no separate spec document required ([ADR 0043](../decisions/0043-github-issues-as-spec-drop-mandatory-spec-docs.md)). An under-specified issue is sent back for scoping instead of guessed at. Every issue belongs to a milestone. A milestone-level overview is written only when several issues share goals.

## Decisions Are Written Down

Two kinds of record, kept apart on purpose:

- An **ADR** is an accepted decision the code is expected to reflect, one per decision. When a decision changes, a later ADR supersedes the earlier one and its status line says so ([ADR 0001](../decisions/0001-keep-project-decisions-in-adrs.md)). An ADR is added before broad coding when a change needs one.
- A **technical note** records a researched conclusion that changes nothing, including "we considered this and are not doing it" ([ADR 0039](../decisions/0039-adopt-technical-notes-for-non-decision-research.md)). It exists so nobody redoes the investigation. A note is never written to justify a change that is happening.

Some of the most useful records are rejections: a design that was built, tried on real hardware and dropped ([ADR 0055](../decisions/0055-client-side-notification-digest.md)), or drafted against a wrong measurement ([ADR 0042](../decisions/0042-async-follow-sync-with-progress-polling.md)). These pages describe the system as it is, and link them where they explain a non-obvious choice.

## Agents Are Part Of The Team

The project is developed with coding agents, so how they are guided is part of the engineering:

- **Conventions have one home.** A root `AGENTS.md` holds the repo-wide rules, and nested `AGENTS.md` files hold package-specific ones, loaded only when an agent works there ([ADR 0052](../decisions/0052-nested-agents-md-and-slim-subagents.md)). There is deliberately no static codemap for agents: it drifts, so they explore the tree.
- **Role-scoped subagents** for the API, the web client and infrastructure carry a persona, boundaries and a definition of done, not conventions ([ADR 0038](../decisions/0038-adopt-role-scoped-subagents-reject-template.md)).
- **Skills** package procedures that recur: implementing a feature from an issue, running a batch of features in parallel worktrees, opening a pull request, preparing a release, using the sandbox, capturing screenshots.
- **Follow-up fixes are classified.** A one-off correction is just applied, while a convention that should hold from now on is proposed for the instruction files and waits for confirmation.

This architecture documentation has a different audience, people reading the repository, so it is a separate thing from agent context and covers concepts, not files ([ADR 0062](../decisions/0062-human-facing-architecture-docs.md)).

## Changes Flow Through Pull Requests

Work happens on a branch in its own worktree, never on `main`, and arrives as a pull request whose description follows a template (summary, impact, references) and carries labels that drive release notes. Tests, migrations and config changes, and any ADR or spec updates are reviewed together with the code. A pre-commit hook formats and lints staged files, CI runs the same checks plus the test tiers ([deploy and release](deploy-and-release.md)), and a failing run links its published report.

Commits follow Conventional Commits, and the project has no backward-compatibility code before launch: when a schema changes, the migration backfills existing rows so every environment converges on the one new state.

## Shipping

Merging deploys to preview. Production ships only when a release is published ([ADR 0041](../decisions/0041-release-gated-production-deploys.md)), prepared by a skill that reads the merged pull requests, flags migrations, config and service-worker risks, and drafts the changelog in each supported language, but never publishes.
