---
name: implementing-a-feature
description: Use when asked to implement a feature from a spec path, GitHub issue, or local issue file in this repo, before writing any implementation code.
---

# Implementing a Feature

## Overview

Operationalizes this repo's Development Workflow (project CLAUDE.md): take in a spec or issue, resolve every open question with the user before coding, implement, then leave a handoff doc for the human who will review and commit.

## When to use

Given a spec path (`specs/milestones/<name>/*.md`), a GitHub issue (number or URL), or a local issue file (`.agents/issues/*.md`), before starting implementation work.

## What to do

1. **Load the input.**
   - Spec path under `specs/milestones/<name>/`: read it directly, treat as source of truth.
   - GitHub issue: `gh issue view <number>`.
   - Local issue file (`.agents/issues/*.md`): read it directly.

2. **Check it's spec-shaped.** A spec-shaped input has, at minimum: a goal/problem statement, a resolved solution/scope (not just a raw idea), and acceptance criteria. If the input is a raw issue with no resolved scope — a bug title with no proposed fix, a feature idea with no scope boundary — say so explicitly and propose drafting a spec under `specs/milestones/<name>/` before continuing. Do not start implementation on an unscoped issue.

3. **Resolve every open question before coding.** Scan for unresolved items: explicit "TBD"/"open question"/"unresolved" markers, unchecked design choices, ambiguous acceptance criteria, or anything phrased as a question. For each one:
   - Propose a concrete resolution with reasoning.
   - Get explicit user confirmation (chat reply, or AskUserQuestion for multi-way choices) before writing any code.
   - If the resolution is itself an accepted decision the code must follow going forward (not just an implementation detail), it needs an ADR per [ADR 0001](../../../docs/decisions/0001-keep-project-decisions-in-adrs.md) before broad coding — flag this to the user.

   If the input already has no open items, say so and proceed straight to implementation. Do not invent questions that aren't there.

4. **For bug reports, confirm the repro before fixing.** If the input's `Proposed solution` (or equivalent) has an unconfirmed repro, an unidentified root cause, or hedges with "if it still reproduces" / "possible explanations" — reproduce it on current `main` first (or write a failing test that captures it) before touching implementation code. Invoke the superpowers:systematic-debugging skill for the root-cause work itself. If it doesn't reproduce, say so and stop — close/report that instead of fixing a guessed cause.

5. **Implement.** Follow the existing per-domain conventions ([docs/agents/api-source-layout.md](../../../docs/agents/api-source-layout.md), [docs/agents/web-source-layout.md](../../../docs/agents/web-source-layout.md)) and any referenced ADRs. Delegate to the `api-engineer`/`web-engineer` subagents when the work is confined to their domain.

6. **Write the handoff doc.** On completion, create `.agents/handoff-<slug>.md` (slug derived from the spec/issue name) containing:
   - What was implemented, against which spec/issue.
   - Every decision from step 3 (question → resolution → reasoning), plus any decision made mid-implementation that wasn't in the original input.
   - How to test: automated (which suites/commands) and manual (concrete steps a reviewer can follow).
   - Anything left undone or deliberately out of scope.

7. **Stop. Do not touch git.** Never run `git add`, `git commit`, `git reset`, or any other staging/history command, even after the handoff doc is written. Report what changed in chat and let the user stage and commit it themselves.

## Common mistakes

- Starting implementation on a bare issue title with no resolved scope — that's spec work, not implementation work.
- Resolving a TBD silently and only mentioning it in the handoff doc afterward — confirmation happens before code, not after.
- Fixing a bug from its proposed solution without confirming the repro/root cause first — the proposed solution may itself be a guess (e.g. "if it still reproduces...").
- Skipping the handoff doc because "nothing interesting happened" — write it every time; it's the reviewer's only account of decisions made mid-implementation.
- Running `git add` "just to stage for review" — staging is git state manipulation and stays off-limits exactly like commit/push.
