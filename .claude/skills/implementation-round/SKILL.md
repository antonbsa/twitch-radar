---
name: implementation-round
description: Use when asked to implement a batch of specs/issues in this repo together - validates every item's readiness and how items relate to each other upfront (dependencies, shared-flow coupling), groups items that need to land as one implementation, then runs implementing-a-feature per group in its own isolated git worktree, in parallel.
---

# Implementation Round

## Overview

Runs [implementing-a-feature](../implementing-a-feature) for a batch of specs/issues, grouped so each group becomes one implementation in its own isolated git worktree under `.agents/worktrees/`, groups run in parallel. Validates every item's readiness and how it relates to the rest of the batch before creating any worktree, so the batch either proceeds as a whole or pauses on one consolidated set of questions covering both open decisions and the proposed grouping.

## When to use

Given a list of inputs to implement together - any mix of spec paths (`specs/milestones/<name>/*.md`), GitHub issue numbers/URLs, or local issue files (`.agents/issues/*.md`). You don't need to pre-group them yourself - the skill determines which items are independent (one worktree each) and which are coupled enough to need a single shared implementation (one worktree, multiple items; see superpowers:dispatching-parallel-agents for the independence test). Items touching the same file is not disqualifying by itself - each worktree is an isolated copy, so plain file overlap only surfaces as a later merge conflict, which is expected and not blocking; what actually forces grouping is a sequential dependency or two items changing the same flow. For a single item, use `implementing-a-feature` directly instead.

## What to do

1. **Validate every item and assess how they relate, before creating anything.** For each item, apply `implementing-a-feature` steps 1-3 as analysis only - do not implement yet:
   - Load it (spec: read directly; GitHub issue: `gh issue view <number>`; local issue file: read directly).
   - Check it's spec-shaped (goal, resolved scope, acceptance criteria) - flag as `NEEDS_INPUT` if it's a raw idea with no resolved scope.
   - Scan for any open decision blocking implementation: TBDs, unresolved design choices ("which library", "which callers migrate to the new component"), ambiguous acceptance criteria - any decision needed to proceed, not only ADR-worthy ones. Flag as `NEEDS_INPUT` with a proposed resolution and reasoning for each.
   - No open items -> `READY`.

   Then, across the whole batch, check how items relate to each other:
   - Sequential dependency (one item's implementation needs another item's work to exist first - a shared type, endpoint, migration) - these must be combined into one group, implemented in dependency order inside the same worktree/branch. Never split a real dependency into two parallel worktrees.
   - Shared-flow coupling (two items change the same behavior/flow closely enough that implementing them separately risks inconsistency or rework, e.g. both alter the same state machine or API contract) - propose combining them into one group, with the reasoning stated.
   - No relationship found - the item stays its own group of one; this is the default and needs no justification.

   The output of this step is a proposed grouping: the list of groups, each with its member item(s) and, for any group of more than one item, the reasoning for combining them.

2. **Gate on the whole batch, not per item.**
   - All items `READY` and every group a singleton (no combining proposed) -> continue to step 3 automatically, no pause.
   - Otherwise - any `NEEDS_INPUT`, or any proposed group combining 2+ items - stop. Present everything in one plain chat message (a direct text response): every open question from every flagged item, grouped by item, each with your recommended resolution; and the proposed grouping with reasoning for any group of more than one item, framed as a recommendation the user can confirm or override. Do not use an interactive question/input tool (e.g. `AskUserQuestion`) for this - the batch can have several open questions and a grouping call to make at once, and they must all be visible together as text, not walked through one at a time in a dialog. Resolve both in the same round: a decision resolution can itself change whether two items are actually coupled, so don't ask about grouping separately from open decisions. Wait until the user has answered every open item and confirmed the grouping across the whole batch - do not dispatch the settled groups early while others are still pending. If a resolution is itself an accepted decision the code must follow going forward, flag it for an ADR per [ADR 0001](../../../docs/decisions/0001-keep-project-decisions-in-adrs.md), same as `implementing-a-feature` step 3 - most resolutions are plain implementation choices and won't need one. Once every question is answered and the grouping is confirmed, continue to step 3 for the full batch.

3. **Derive a worktree name per group.** Succinct, kebab-case, descriptive of the implementation itself - no issue number, no generic id (per [CLAUDE.md](../../../CLAUDE.md) "Worktree Configuration"). For a group of more than one item, name it after the combined implementation, not after one member item. This name is both the branch name and the worktree directory name.

4. **Create every worktree before dispatching anything.** For each group, from the repo root:
   ```bash
   git worktree add .agents/worktrees/<name> -b <name>
   ```
   branching off current `main`. Do this for the whole batch up front, in your own session - a naming collision or a dirty `main` surfaces here, not inside a subagent mid-implementation.

5. **Dispatch one subagent per group, all in the same message.** Pick the agent type by the group's scope: `api-engineer` for changes confined to `apps/api`, `web-engineer` for `apps/web`, `claude`/`general-purpose` otherwise (if a group mixes scopes, use `claude`/`general-purpose`). Each dispatch prompt must include:
   - Every item in the group (spec path / issue number / issue file) and the absolute path of the shared worktree - the subagent has no `isolation` param that can target that exact path, so it must treat that path as its working directory for the whole task (`cd` there, and/or use absolute paths under it for every Read/Write/Edit/Bash call).
   - For a multi-item group, the reasoning for why these items are combined and, if there's a sequential dependency, the order to implement them in.
   - Any resolution from step 2 that applies to this group's item(s), stated as already-decided - the subagent must not re-ask it.
   - The instruction to invoke `implementing-a-feature` for steps 4-6 (implement, then write the handoff doc) for each item in the group, with **step 7 overridden**: instead of never touching git, commit the finished work on the group's own branch, following this repo's Conventional Commits rules ([CLAUDE.md](../../../CLAUDE.md) "Commit Message Rules") - one commit per item if they're logically separable, or a single commit if the group is one cohesive change. Still no push, no PR - those stay manual and explicit.
   - A short report contract: status (`DONE`/`BLOCKED`), commit hash(es), handoff doc path(s).

6. **Report the whole batch once every subagent returns.** One consolidated summary, per group: worktree path, branch, items covered, commit hash(es), handoff doc path(s) (`.agents/handoff-<slug>.md`, inside that worktree), and status. Leave every worktree in place - this skill never deletes or merges them, and never pushes or opens a PR. Point the user at `creating-pull-requests` for whichever branches they want to open next, one at a time.

## Common mistakes

- Defaulting to one worktree per item without actively checking for a sequential dependency or shared-flow coupling first - the skill must look for these, not assume every item is independent.
- Splitting a real sequential dependency into two parallel worktrees/subagents - if item B needs item A's work to exist, they belong in the same group, implemented in order, not raced against each other.
- Deciding a multi-item grouping silently instead of surfacing it for confirmation - like open decisions, a proposed merge changes the shape of the batch (fewer worktrees, one branch covering multiple items) and needs the same one-round confirmation before any worktree is created.
- Asking about grouping in a separate round from open decisions - a decision resolution can change whether two items are actually coupled, so both must be resolved together in one message.
- Dispatching the settled groups while others are still waiting on an answer - the gate is on the whole batch, not per group.
- Using an interactive question tool (e.g. `AskUserQuestion`) to surface the batch's open questions or grouping proposal instead of a plain chat response - that hides multiple items' questions behind a one-at-a-time dialog when they need to be visible together as text.
- Treating two items touching the same file as disqualifying, or as requiring grouping, on its own - only a real dependency or a shared-flow change between items forces grouping; a plain file overlap is just a later merge conflict.
- Treating "decision" as ADR-only - most open decisions flagged in step 1 are plain implementation choices (a library, which callers to migrate); ADR is a conditional flag on top, not the trigger itself.
- Using the Agent tool's `isolation: "worktree"` for the per-group dispatch - it can't be pointed at `.agents/worktrees/<name>`, which the branch-naming rule requires. Create the worktree yourself first, then dispatch a plain agent into it.
- Letting a subagent skip the commit ("implementing-a-feature says never touch git") - that rule is overridden here specifically because the work is isolated in its own worktree/branch; the commit is what makes the branch reviewable.
- Naming a worktree/branch after an issue number, a generic id (`issue-42`, `agent-3`), or - for a multi-item group - after only one of its member items instead of the combined implementation.
- Auto-merging, pushing, or opening a PR from inside this skill - it stops at a committed, isolated branch; everything after that is a separate, explicit step.
