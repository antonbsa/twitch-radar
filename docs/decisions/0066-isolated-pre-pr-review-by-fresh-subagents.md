---
status: Accepted
area: process
---

# 0066 - Isolated Pre-PR Review By Fresh Subagents

## Status

Accepted. Builds on the issue-as-spec workflow of [ADR 0043](0043-github-issues-as-spec-drop-mandatory-spec-docs.md).

## Context

The workflow goes issue, implementation, handoff, PR, with no review between implementation and the PR. The `api-engineer` and `web-engineer` subagents described themselves as implementing and reviewing, so the agent that wrote a change was also the one judging it, with its own rationale in context. An implementer's rationale makes it agree with its own work.

## Decision

- **Review runs before the PR, in fresh subagents.** The implementing agent runs the installed `mattpocock-skills:code-review` skill, which spawns a Standards reviewer (against the `AGENTS.md` files) and a Spec reviewer (against the originating issue) in parallel. `feature` owns the step.
- **The reviewer gets only the diff against `main` (three-dot) with the commit list, the originating spec (issue number or local issue file, passed explicitly), and the repo's `AGENTS.md` files.** It never gets the handoff doc or any summary or rationale from the implementer, and review never uses a forked subagent, because a fork inherits the whole conversation.
- **The implementer triages every finding** with the Follow-up Changes classification, fixes what it accepts and re-runs the affected tests. Findings it rejects are recorded with a one-line reason in the handoff's Design Decisions, so the human sees what was dismissed.
- **Subagents implement only.** `api-engineer` and `web-engineer` drop "and review" from their self-description.

## Alternatives considered

- **Same-context self-review.** Rejected: the implementer's rationale biases it toward agreeing with itself.
- **A custom reviewer subagent with project memory.** Rejected: memory accumulates bias across reviews, and the installed skill already gives the two fresh-context axes.
- **CI review with `claude-code-action`.** Rejected for now: cost on every PR and feedback only after the push. It can be revisited.

## Consequences

- Triage by the implementer still reintroduces some bias; the recorded rejections are the counterweight.
- `feature-round` subagents run the review themselves, so each group spawns its own reviewers.
- Review is a nudge, not a gate, for work done outside `feature`: `open-pr` suggests it when the branch shows no sign of it.
