---
name: implementation-round
description: Use when asked to implement a batch of independent specs/issues in this repo together - validates every item's readiness upfront, then runs implementing-a-feature for each in its own isolated git worktree, in parallel.
---

# Implementation Round

## Overview

Runs [implementing-a-feature](../implementing-a-feature) for a batch of independent specs/issues in parallel, each isolated in its own git worktree under `.agents/worktrees/`. Validates every item's readiness before creating any worktree, so the batch either proceeds as a whole or pauses on one consolidated set of questions.

## When to use

Given a list of inputs to implement together - any mix of spec paths (`specs/milestones/<name>/*.md`), GitHub issue numbers/URLs, or local issue files (`.agents/issues/*.md`) - where each item is independent (no shared files, no sequential dependency between them; see superpowers:dispatching-parallel-agents for the independence test). For a single item, use `implementing-a-feature` directly instead.

## What to do

1. **Validate every item, before creating anything.** For each item, apply `implementing-a-feature` steps 1-3 as analysis only - do not implement yet:
   - Load it (spec: read directly; GitHub issue: `gh issue view <number>`; local issue file: read directly).
   - Check it's spec-shaped (goal, resolved scope, acceptance criteria) - flag as `NEEDS_INPUT` if it's a raw idea with no resolved scope.
   - Scan for any open decision blocking implementation: TBDs, unresolved design choices ("which library", "which callers migrate to the new component"), ambiguous acceptance criteria - any decision needed to proceed, not only ADR-worthy ones. Flag as `NEEDS_INPUT` with a proposed resolution and reasoning for each.
   - No open items -> `READY`.

2. **Gate on the whole batch, not per item.**
   - All `READY` -> continue to step 3 automatically, no pause.
   - Any `NEEDS_INPUT` -> stop. Present every open question from every flagged item in one message, grouped by item, each with your recommended resolution. Wait until the user has answered every open item across the whole batch - do not dispatch the `READY` items early while others are still pending. If a resolution is itself an accepted decision the code must follow going forward, flag it for an ADR per [ADR 0001](../../../docs/decisions/0001-keep-project-decisions-in-adrs.md), same as `implementing-a-feature` step 3 - most resolutions are plain implementation choices and won't need one. Once every question is answered, continue to step 3 for the full batch.

3. **Derive a worktree name per item.** Succinct, kebab-case, descriptive of the implementation itself - no issue number, no generic id (per [CLAUDE.md](../../../CLAUDE.md) "Worktree Configuration"). This name is both the branch name and the worktree directory name.

4. **Create every worktree before dispatching anything.** For each item, from the repo root:
   ```bash
   git worktree add .agents/worktrees/<name> -b <name>
   ```
   branching off current `main`. Do this for the whole batch up front, in your own session - a naming collision or a dirty `main` surfaces here, not inside a subagent mid-implementation.

5. **Dispatch one subagent per item, all in the same message.** Pick the agent type by the item's scope: `api-engineer` for changes confined to `apps/api`, `web-engineer` for `apps/web`, `claude`/`general-purpose` otherwise. Each dispatch prompt must include:
   - The item (spec path / issue number / issue file) and the absolute path of its worktree - the subagent has no `isolation` param that can target that exact path, so it must treat that path as its working directory for the whole task (`cd` there, and/or use absolute paths under it for every Read/Write/Edit/Bash call).
   - Any resolution from step 2 that applies to this item, stated as already-decided - the subagent must not re-ask it.
   - The instruction to invoke `implementing-a-feature` for steps 4-6 (implement, then write the handoff doc), with **step 7 overridden**: instead of never touching git, commit the finished work on the item's own branch, one commit following this repo's Conventional Commits rules ([CLAUDE.md](../../../CLAUDE.md) "Commit Message Rules"). Still no push, no PR - those stay manual and explicit.
   - A short report contract: status (`DONE`/`BLOCKED`), commit hash, handoff doc path.

6. **Report the whole batch once every subagent returns.** One consolidated summary, per item: worktree path, branch, commit hash, handoff doc path (`.agents/handoff-<slug>.md`, inside that worktree), and status. Leave every worktree in place - this skill never deletes or merges them, and never pushes or opens a PR. Point the user at `creating-pull-requests` for whichever branches they want to open next, one at a time.

## Common mistakes

- Dispatching the `READY` items while `NEEDS_INPUT` items are still waiting on an answer - the gate is on the whole batch, not per item.
- Treating "decision" as ADR-only - most open decisions flagged in step 1 are plain implementation choices (a library, which callers to migrate); ADR is a conditional flag on top, not the trigger itself.
- Using the Agent tool's `isolation: "worktree"` for the per-item dispatch - it can't be pointed at `.agents/worktrees/<name>`, which the branch-naming rule requires. Create the worktree yourself first, then dispatch a plain agent into it.
- Letting a subagent skip the commit ("implementing-a-feature says never touch git") - that rule is overridden here specifically because the work is isolated in its own worktree/branch; the commit is what makes the branch reviewable.
- Naming a worktree/branch after the issue number or a generic id (`issue-42`, `agent-3`) instead of what the implementation actually is.
- Auto-merging, pushing, or opening a PR from inside this skill - it stops at a committed, isolated branch; everything after that is a separate, explicit step.
