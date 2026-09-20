---
name: implementing-a-feature
description: Use when asked to implement a feature from a GitHub issue, local issue file, or spec path in this repo, before writing any implementation code.
---

# Implementing a Feature

## Overview

Operationalizes this repo's Development Workflow (project CLAUDE.md): take in a spec-shaped GitHub issue (the normal case, per ADR 0043) or a committed spec document, resolve every open question with the user before coding, implement, then write (or rewrite) a handoff doc for the human who will review and commit.

## When to use

Given a GitHub issue (number or URL) — the default input from milestone 1 onward — a local issue file (`.agents/issues/*.md`), or a spec path (`specs/milestones/<name>/*.md`) for the rarer milestone-overview case, before starting implementation work.

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

4. **For bug reports, confirm the repro before fixing.** If the input's `Proposed solution` (or equivalent) has an unconfirmed repro, an unidentified root cause, or hedges with "if it still reproduces" / "possible explanations" — reproduce it on current `main` first (or write a failing test that captures it) before touching implementation code. Invoke the superpowers:systematic-debugging skill for the root-cause work itself. If it doesn't reproduce, say so and stop — close/report that instead of fixing a guessed cause.

5. **Implement.** Follow the existing per-domain conventions in [CLAUDE.md](../../../CLAUDE.md) and the `api-engineer`/`web-engineer` subagent instructions, plus any referenced ADRs. Delegate to those subagents when the work is confined to their domain. Follow [CLAUDE.md](../../../CLAUDE.md)'s Test Execution Scope for how much to run and when while iterating — filtered tests for a small change, the full relevant tier once after a large chunk of work lands; don't run a full tier after every edit.

6. **Write (or rewrite) the handoff doc.** Create `.agents/handoff-<slug>.md` (slug derived from the spec/issue name) — or, if it already exists for this branch (this is a follow-up run of this skill), overwrite it in full — using the structure in [HANDOFF_TEMPLATE.md](HANDOFF_TEMPLATE.md). The file always reflects the branch's current, final state: rewrite it whole on every iteration rather than appending, as if it had been written this way from the start — never describe an earlier iteration or an approach abandoned since. Fill in:
   - Objective/Problem and Scope, from the driving issue/spec and the actual change.
   - Design Decisions: every resolution from step 3 (question → resolution → reasoning), plus any decision made mid-implementation that wasn't in the original input.
   - How to Validate: automated (which suites/commands actually cover this — scoped per the Test Execution Scope rule in step 5, not necessarily a full run) and manual (concrete steps a reviewer can follow).
   - Trade-offs & Known Follow-ups and Rollout/Migration Risks when they apply. Per the template's own instructions, omit a section entirely (not "N/A") when nothing in it applies to this branch.

   If this run is itself a follow-up to work already on this branch, apply [CLAUDE.md](../../../CLAUDE.md)'s Follow-up Changes convention first: classify each requested fix as one-off or as a pattern/convention change, and propose persisting the latter before finishing. That classification is part of what the rewritten handoff should reflect, not a separate step to skip.

7. **Stop. Do not touch git.** Never run `git add`, `git commit`, `git reset`, or any other staging/history command, even after the handoff doc is written. Report what changed in chat and let the user stage and commit it themselves.

## Common mistakes

- Starting implementation on a bare issue title with no resolved scope — that's spec work, not implementation work.
- Resolving a TBD silently and only mentioning it in the handoff doc afterward — confirmation happens before code, not after.
- Fixing a bug from its proposed solution without confirming the repro/root cause first — the proposed solution may itself be a guess (e.g. "if it still reproduces...").
- Skipping the handoff doc because "nothing interesting happened" — write it every time; it's the reviewer's only account of decisions made mid-implementation.
- Appending to an existing handoff instead of rewriting it in full — a handoff that reads as a change log describes iterations that no longer matter, and the PR-writing skill reads it expecting the branch's current state, not its history.
- Running a full test tier after every small edit instead of following the Test Execution Scope rule — reserve the full run for after a large chunk of work lands.
- Treating a follow-up fix's implied convention change as a one-off without proposing to persist it — see `CLAUDE.md`'s Follow-up Changes.
- Running `git add` "just to stage for review" — staging is git state manipulation and stays off-limits exactly like commit/push.
