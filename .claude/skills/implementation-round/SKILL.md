---
name: implementation-round
description: Implement a batch of specs/issues in parallel, one isolated git worktree per group of related items.
disable-model-invocation: true
---

# Implementation Round

Runs [implementing-a-feature](../implementing-a-feature) for a batch of specs/issues, one isolated git worktree per group under `.agents/worktrees/`, groups in parallel. Every item is validated before any worktree is created, so the batch either proceeds whole or pauses on one consolidated set of questions (open decisions and proposed grouping).

## When to use

Given a list of inputs to implement together - any mix of spec paths (`specs/milestones/<name>/*.md`), GitHub issue numbers/URLs, or local issue files (`.agents/issues/*.md`). You don't need to pre-group them yourself - the skill determines which items are independent (one worktree each) and which are coupled enough to need a single shared implementation (one worktree, multiple items; see superpowers:dispatching-parallel-agents for the independence test). Items touching the same file is not disqualifying by itself - each worktree is an isolated copy, so plain file overlap only surfaces as a later merge conflict, which is expected and not blocking; what actually forces grouping is a sequential dependency or two items changing the same flow. For a single item, use `implementing-a-feature` directly instead.

## What to do

1. **Validate every item and assess how they relate, before creating anything.** For each item, apply `implementing-a-feature`'s load, spec-shape and open-question steps as analysis only - do not implement yet:
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
   - Otherwise - any `NEEDS_INPUT`, or any proposed group combining 2+ items - stop. Present everything in one plain chat message (a direct text response): every open question from every flagged item, grouped by item, each with your recommended resolution; and the proposed grouping with reasoning for any group of more than one item, framed as a recommendation the user can confirm or override. Do not use an interactive question/input tool (e.g. `AskUserQuestion`) for this - the batch can have several open questions and a grouping call to make at once, and they must all be visible together as text, not walked through one at a time in a dialog. Resolve both in the same round: a decision resolution can itself change whether two items are actually coupled, so don't ask about grouping separately from open decisions. Wait until the user has answered every open item and confirmed the grouping across the whole batch - do not dispatch the settled groups early while others are still pending. If a resolution is itself an accepted decision the code must follow going forward, flag it for an ADR per [ADR 0001](../../../docs/decisions/0001-keep-project-decisions-in-adrs.md), same as `implementing-a-feature`'s open-question step - most resolutions are plain implementation choices and won't need one. Once every question is answered and the grouping is confirmed, continue to step 3 for the full batch.

3. **Derive a worktree name per group.** Succinct, kebab-case, descriptive of the implementation itself - no issue number, no generic id (per AGENTS.md "Worktrees and `.agents/`"). For a group of more than one item, name it after the combined implementation, not after one member item. This name is both the branch name and the worktree directory name.

4. **Create every worktree, with dependencies installed, before dispatching anything.** For each group, from the repo root, branching off the latest `origin/main` (a fresh worktree has no `node_modules`, so the install is part of creating it):
   ```bash
   git fetch origin main
   git worktree add --no-track -b <name> .agents/worktrees/<name> origin/main && npm install --prefix .agents/worktrees/<name>
   ```
   Do this for the whole batch up front, in your own session - a naming collision surfaces here, not inside a subagent mid-implementation. Done when every worktree has `node_modules/.bin/tsc`; dispatch nothing until that holds (a subagent without it fails typecheck with `TS2688` on `@cloudflare/workers-types`).

5. **Dispatch one subagent per group, all in the same message.** Pick the agent type by the group's scope: `api-engineer` for changes confined to `apps/api`, `web-engineer` for `apps/web`, `infra-engineer` for migrations/wrangler/env/deploy scripts, `claude`/`general-purpose` otherwise (including groups that mix scopes). Each dispatch prompt must include:
   - Every item in the group (spec path / issue number / issue file) and the absolute path of the shared worktree - the subagent has no `isolation` param that can target that exact path, so it must treat that path as its working directory for the whole task (`cd` there, and/or use absolute paths under it for every Read/Write/Edit/Bash call).
   - For a multi-item group, the reasoning for why these items are combined and, if there's a sequential dependency, the order to implement them in.
   - Any resolution from step 2 that applies to this group's item(s), stated as already-decided - the subagent must not re-ask it.
   - The instruction to invoke `implementing-a-feature` from its bug-repro step through its handoff step for each item in the group (its "Before the first write" section is already satisfied off `main`), with its final **Stop step overridden**: instead of never touching git, commit the finished work on the group's own branch, following this repo's Conventional Commits rules (AGENTS.md "Commits"; this autonomous commit carries the `Co-Authored-By` trailer) - one commit per item if they're logically separable, or a single commit if the group is one cohesive change. Still no push, no PR - those stay manual and explicit.
   - Test-run contention: both tiers use fixed ports shared by every worktree, so wrap each tier run in `flock /tmp/twitch-radar-tests.lock <command>` to serialize across groups. Never kill another session's servers.
   - A short report contract: status (`DONE`/`BLOCKED`), commit hash(es), handoff doc path(s).

6. **Report the whole batch once every subagent returns.** One consolidated summary, per group: worktree path, branch, items covered, commit hash(es), handoff doc path(s) (`.agents/handoff-<slug>.md`, inside that worktree), and status. End each group with its own fenced `bash` block holding only `code -r <absolute worktree path>`: the desktop app gives each shell block a Run button, so the user opens that worktree in VS Code in one click, reusing the current window. Leave every worktree in place - this skill never deletes or merges them, and never pushes or opens a PR. Point the user at `creating-pull-requests` for whichever branches they want to open next, one at a time.

## Common mistakes

- Defaulting to one worktree per item without checking for a sequential dependency or shared-flow coupling.
- Splitting a real dependency into parallel worktrees: if B needs A's work, they share a group, in order.
- Deciding a multi-item grouping silently, or asking about it in a separate round from open decisions: a resolution can change whether items are coupled.
- Dispatching settled groups while others still wait on an answer: the gate is on the whole batch.
- Using `AskUserQuestion` for the batch's questions: they must be visible together as plain text.
- Treating shared-file overlap as a reason to group: that is just a later merge conflict.
- Treating every open decision as ADR-worthy: most are plain implementation choices.
- Using the Agent tool's `isolation: "worktree"`: it can't target `.agents/worktrees/<name>`. Create the worktree yourself, then dispatch a plain agent into it.
- Letting a subagent skip the commit: the "never touch git" rule is overridden here because the work is isolated on its own branch.
- Pushing, merging or opening a PR from inside this skill.
