# 0043 - GitHub Issues As Spec; Drop The Mandatory Per-Feature Spec Document

## Status

Accepted

## Context

The current Development Workflow (project `CLAUDE.md`) mandates a committed spec document under `specs/milestones/<name>/` as step 2 of every change, ahead of implementation: "From there on, work is driven by a spec under `specs/milestones/<name>` ... describing goals, requirements, scope, and validation." The `Spec Location` section reinforces this as a hard requirement for all new work post-MVP.

This was set up while the project was POC/MVP-scoped, where a small, fixed set of phases (auth/PWA shell, preferences, EventSub, state/matching, delivery) benefited from an explicit, versioned tracking document per phase, committed alongside the code it described. `specs/mvp/` and one file under `specs/milestones/0-foundations/` are the artifacts of that period.

The project has since grown past that shape: GitHub Issues and Milestones now do the tracking GitHub already does well (status, assignment, cross-linking, milestone grouping), and the app's actual size doesn't justify a second, hand-maintained tracking layer duplicating that. Reviewing the 9 open issues under "Milestone 2: Completion" (#21, #22, #23, #29, #31, #33, #35, #38, #63) as part of planning that milestone's implementation order showed every one of them already spec-shaped in practice: a `## Problem/motivation` section with file:line references, a `## Proposed solution`, and `## Acceptance criteria` — several (#35, #23, #63) explicitly flagging that an ADR is required before implementation, exactly the signal the current workflow's step 3 is meant to catch. Writing a second, separately-committed spec file that restates this content would be pure duplication, not added rigor.

The `implementing-a-feature` skill already reflects this in practice more than `CLAUDE.md` does: it accepts "a spec path, GitHub issue, or local issue file" as equally valid inputs, and its own gate (step 2, "Check it's spec-shaped") is a property of the _content_, not of where that content is stored. Nothing in the skill today actually requires a file under `specs/milestones/`.

## Decision

**A GitHub issue that is spec-shaped (problem/motivation, a resolved proposed solution, acceptance criteria) is sufficient input for implementation on its own. A separate committed spec document under `specs/milestones/<name>/` is no longer required per feature/issue.**

Specifically:

1. `CLAUDE.md`'s Development Workflow step 2 changes from "work is driven by a spec under `specs/milestones/<name>`" to: work is driven by a spec-shaped GitHub issue (or, if none exists yet, a spec-shaped local issue file under `.agents/issues/` per existing convention). A committed spec file remains optional, not mandatory.
2. `specs/milestones/<name>/` stops being a mandatory stop in the workflow and becomes an opt-in tool for the one case a single issue doesn't cover well: a milestone-level overview that needs to state goals/scope/validation spanning multiple issues at once. Individual features/issues don't get one just because work is starting.
3. Step 3 of the workflow (ADR before broad coding when the spec/issue requires a decision) is unchanged — this ADR only removes the spec-document requirement, not the decision-documentation requirement. Non-decision research still goes through TNs per [ADR 0039](0039-adopt-technical-notes-for-non-decision-research.md), also unchanged.
4. `specs/mvp/` and `specs/milestones/0-foundations/` are left as-is — this is not retroactive. They remain the historical record for the phases that produced them.
5. The `implementing-a-feature` skill's step 2 wording is tightened so treating a bare GitHub issue as sufficient is the normal path, not a fallback exception to a spec-file default — no functional change to the skill's actual gate (still checks problem statement + resolved scope + acceptance criteria), just removing language that frames an issue as a lesser substitute for a spec file.

## Rejected alternatives

- **Keep the spec document mandatory for every feature.** Rejected as the status quo this ADR changes — it duplicates content GitHub issues already carry well at this project's current scale, for a project with one contributor plus agents, not a team needing a second cross-referenced source of truth.
- **Drop spec documents entirely, including the milestone-overview case.** Rejected — a milestone that genuinely needs a narrative spanning several issues (e.g., a cross-cutting feature like i18n touching both apps plus the notification pipeline) still benefits from one place stating that shared context. Keeping `specs/milestones/<name>/` available as an opt-in tool preserves that without forcing it on every single-issue feature.
- **Retroactively remove or migrate `specs/mvp/` and `specs/milestones/0-foundations/`.** Out of scope — no functional or historical reason to touch content that already shipped under the old convention.

## Consequences

- `CLAUDE.md`'s Development Workflow (step 2) and `Spec Location` section need editing to match this decision — tracked as a follow-up once this ADR is accepted, not bundled into it.
- `implementing-a-feature` skill's step 2 needs a wording pass (see Decision, point 5) — same follow-up.
- The bar shifts onto issue-writing quality: since the issue _is_ now the spec, an underspecified issue (no proposed solution, no acceptance criteria) genuinely blocks implementation the same way an unwritten spec would have — `implementing-a-feature`'s existing step 2 gate already enforces this, it just now applies to the issue itself as the primary artifact rather than as a stand-in for a missing file.
- Milestone 2 onward, expect zero new files under `specs/milestones/<name>/` per feature; a milestone-overview file may still appear occasionally, by choice, not by rule.
