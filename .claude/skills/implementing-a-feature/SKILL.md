---
name: implementing-a-feature
description: Use when asked to implement a feature from a GitHub issue, local issue file, or spec path in this repo, before writing any implementation code.
---

# Implementing a Feature

## Before the first write

Every write this skill makes happens off `main`: a spec draft, an ADR, code, the handoff doc. Loading and scoping (steps 1-3) stay read-only until they draft a spec or ADR, so an issue that stops at scoping needs no worktree. Before the first write, if `git branch --show-current` prints `main`, branch a worktree off the latest `origin/main`, named after the work per AGENTS.md "Worktrees and `.agents/`":
```bash
git fetch origin main
git worktree add --no-track -b <branch-name> .agents/worktrees/<branch-name> origin/main
```
Then call `EnterWorktree` with `path: .agents/worktrees/<branch-name>`, which moves the whole session (file tools, nested `AGENTS.md`) into the worktree; a Bash `cd` moves only the shell, and Read/Edit/Write would keep hitting the `main` checkout. Run `npm install` at its root before the first command that runs project code. Uncommitted changes in the `main` checkout stay behind there: if any relate to this work, ask the user before branching. On a branch already made for this work (e.g. dispatched by `implementation-round` into its worktree), write where you are; on a branch for unrelated work, ask the user before writing.

## What to do

1. **Load the input.**
   - GitHub issue: `gh issue view <number>`.
   - Local issue file (`.agents/issues/*.md`): read it directly.
   - Spec path under `specs/milestones/<name>/`: read it directly, treat as source of truth.

2. **Check it's spec-shaped.** A spec-shaped input has, at minimum: a goal/problem statement, a resolved solution/scope (not just a raw idea), and acceptance criteria — this applies the same way to an issue as to a committed spec file, per ADR 0043. If the input is underspecified — a bug title with no proposed fix, a feature idea with no scope boundary — say so explicitly and propose resolving the open scope with the user (in chat, or by drafting a spec under `specs/milestones/<name>/` if the gap is a multi-issue milestone-level one) before continuing. Do not start implementation on an unscoped issue.

3. **Resolve every open question before coding.** Scan for unresolved items: explicit "TBD"/"open question"/"unresolved" markers, unchecked design choices, ambiguous acceptance criteria, or anything phrased as a question. For each one:
   - Propose a concrete resolution with reasoning.
   - Get explicit user confirmation (chat reply, or AskUserQuestion for multi-way choices) before writing any code.
   - If the resolution is itself an accepted decision the code must follow going forward (not just an implementation detail), it needs an ADR per [ADR 0001](../../../docs/decisions/0001-keep-project-decisions-in-adrs.md) before broad coding — flag this to the user.

   If the input already has no open items, say so and proceed straight to implementation. Do not invent questions that aren't there.

4. **For bug reports, confirm the repro before fixing.** If the input's `Proposed solution` (or equivalent) has an unconfirmed repro, an unidentified root cause, or hedges with "if it still reproduces" / "possible explanations" — reproduce it on the feature branch first (or write a failing test that captures it) before touching implementation code. Invoke the superpowers:systematic-debugging skill for the root-cause work itself. If it doesn't reproduce, say so and stop — close/report that instead of fixing a guessed cause.

5. **Implement.** Follow the conventions in [AGENTS.md](../../../AGENTS.md) (nested package files load as you work there) and any referenced ADRs. Delegate to `api-engineer`, `web-engineer` or `infra-engineer` when the work is confined to their domain. Follow AGENTS.md "Tests" for how much to run while iterating: filtered tests for a small change, the full relevant tier once after a large chunk of work.

6. **Write (or rewrite) the handoff doc.** Create `.agents/handoff-<slug>.md` (slug derived from the spec/issue name) — or, if it already exists for this branch (this is a follow-up run of this skill), overwrite it in full — using the structure in [HANDOFF_TEMPLATE.md](HANDOFF_TEMPLATE.md). The file always reflects the branch's current, final state: rewrite it whole on every iteration rather than appending, as if it had been written this way from the start — never describe an earlier iteration or an approach abandoned since. Fill in:
   - Objective/Problem and Scope, from the driving issue/spec and the actual change.
   - Design Decisions: every resolution from step 3 (question → resolution → reasoning), plus any decision made mid-implementation that wasn't in the original input.
   - How to Validate: automated (which suites/commands actually cover this — scoped per the AGENTS.md "Tests" rule in step 5, not necessarily a full run) and manual (concrete steps a reviewer can follow).
   - Trade-offs & Known Follow-ups and Rollout/Migration Risks when they apply. Per the template's own instructions, omit a section entirely (not "N/A") when nothing in it applies to this branch.

   If this run is itself a follow-up to work already on this branch, apply [AGENTS.md](../../../AGENTS.md)'s Follow-up Changes convention first: classify each requested fix as one-off or as a pattern/convention change, and propose persisting the latter before finishing. That classification is part of what the rewritten handoff should reflect, not a separate step to skip.

7. **Stop. Leave staging and history to the user.** The branch and worktree from "Before the first write" are the only git state this skill creates; never run `git add`, `git commit`, `git reset`, or any other staging/history command, even after the handoff doc is written. Report what changed in chat and let the user stage and commit it themselves.

## Common mistakes

- Resolving a TBD silently and only mentioning it in the handoff doc afterward: confirmation happens before code.
- Fixing a bug from its proposed solution without confirming the repro first: the proposed solution may itself be a guess.
- Appending to an existing handoff instead of rewriting it in full: the PR-writing skill reads it expecting the branch's current state, not its history.
- Running `git add` "just to stage for review": staging is git state manipulation and stays off-limits like commit/push.
