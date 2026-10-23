---
name: review
description: Use when reviewing a branch's change before its PR (feature's review step, or ad hoc work), in fresh subagents that see only the diff, the spec and the repo's rules.
---

# Isolated Review

Three-axis review of the branch's change, each axis in a fresh subagent so the implementer's reasoning never reaches the reviewer ([ADR 0066](../../../docs/decisions/0066-isolated-pre-pr-review-by-fresh-subagents.md)):

- **Standards**: does the code conform to this repo's documented rules?
- **Spec**: does the code faithfully implement the originating issue / spec?
- **Correctness**: does the change introduce bugs?

This skill only collects findings; triage belongs to the caller (`feature` step 6, or the user).

Adapted from `mattpocock-skills:code-review` 1.3.1, so this repo doesn't depend on a user-level plugin. Changes from upstream: the change includes uncommitted and new files, the spec comes from GitHub issues, the standards are the `AGENTS.md` files, and a Correctness axis and the isolation rules are added. When syncing with a newer upstream, keep those.

## Process

### 1. Pin the change

From the worktree root, `git fetch origin main`, then `BASE=$(git merge-base origin/main HEAD)` and confirm it resolves. The change is `git diff $BASE` (committed and uncommitted tracked work, since `feature` leaves its work uncommitted) plus the new files listed by `git ls-files --others --exclude-standard`. Also note the commits via `git log $BASE..HEAD --oneline`. An empty change stops here with "nothing to review", not inside three parallel subagents.

### 2. Identify the spec source

In order:

1. The issue number(s) or `.agents/issues/*.md` file the caller passed.
2. Issue references in the commit messages (`Closes #45`, `Refs: #123`), read with `gh issue view`.
3. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** subagent is skipped and the report says "no spec available".

### 3. Identify the standards sources

The root `AGENTS.md`, the nested `AGENTS.md` of every directory the change touches, `GLOSSARY.md`, and every ADR a changed line or comment cites.

On top of those, the Standards axis always carries the **smell baseline** below: a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even where the repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo rule always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation. Like any standard here, skip anything tooling already enforces.

Each smell reads _what it is_ → _how to fix_; match it against the diff:

- **Mysterious Name**: a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code**: the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy**: a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps**: the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession**: a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches**: the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change**: one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains**: long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man**: a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

### 4. Spawn the subagents in parallel

Issue all three calls in one message, in the foreground, as `general-purpose` subagents, and aggregate the reports they return.

Each prompt carries exactly: the worktree's absolute path, the step 1 commands (the subagent runs them itself) and commit list, and the axis items below. Everything else stays out: the handoff doc, your summary, your reasoning, the conversation. A `fork` subagent carries the whole conversation, so it is never a reviewer. If you can't spawn subagents (no Agent tool, e.g. you are a subagent yourself), stop and report `REVIEW_UNAVAILABLE` to the caller; a review in your own context is the self-review this skill replaces.

**Standards subagent prompt** includes:

- The list of standards sources from step 3, **plus the smell baseline from step 3** pasted in full (the subagent has no other access to it).
- The brief: "Report, per file/hunk where relevant, (a) every place the diff violates a documented standard: cite the standard (file + the rule); and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls: documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."

**Spec subagent prompt** includes:

- The spec reference from step 2 (issue number to read with `gh issue view`, or file path).
- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."

**Correctness subagent prompt** includes:

- The brief: "Find bugs the change introduces: wrong logic, unhandled edge or error cases, races, data a migration leaves inconsistent, behavior a test should pin but none does, web-platform APIs assumed to work on the installed iOS PWA (root `AGENTS.md`). Give file:line and a concrete failing scenario for each. Report only what you'd bet on. Under 400 words."

If the spec is missing, skip the Spec subagent and note this in the final report.

### 5. Aggregate

Present the three reports under `## Standards`, `## Spec` and `## Correctness` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings, because the axes are deliberately separate (see _Why separate axes_).

End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes: that's the reranking the separation exists to prevent.

## Why separate axes

A change can pass one axis and fail another:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**
- Code that is on-spec and conventional but breaks on an edge case → **Correctness fail.**

Reporting them separately stops one axis from masking another.

## Common mistakes

- Reviewing `main...HEAD` only: inside `feature` the work is still uncommitted, so that diff is empty or stale.
- Passing the handoff, a summary or "context that helps" into a subagent prompt: that is the bias the isolation removes.
- Fixing findings inside this skill: the caller triages them.
