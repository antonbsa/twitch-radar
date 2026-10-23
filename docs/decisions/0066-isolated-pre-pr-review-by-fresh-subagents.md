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

- **Review runs before the PR, in fresh subagents.** The implementing agent runs the project's `review` skill, which spawns three reviewers in parallel: Standards (against the `AGENTS.md` files and cited ADRs), Spec (against the originating issue) and Correctness (bugs the change introduces). `feature` owns the step.
- **The reviewer gets only the change against the merge-base with `origin/main` (committed, uncommitted and new files), the originating spec (issue number or local issue file), and the repo's `AGENTS.md` files.** It never gets the handoff doc or any summary or rationale from the implementer, and review never uses a forked subagent, because a fork inherits the whole conversation.
- **The implementer triages every finding** with the Follow-up Changes classification, fixes what it accepts and re-runs the affected tests. Findings it rejects are recorded with a one-line reason in the handoff's Design Decisions, so the human sees what was dismissed.
- **Subagents implement only.** `api-engineer` and `web-engineer` drop "and review" from their self-description.

## Alternatives considered

- **Same-context self-review.** Rejected: the implementer's rationale biases it toward agreeing with itself.
- **A custom reviewer subagent with project memory.** Rejected: memory accumulates bias across reviews; fresh `general-purpose` subagents dispatched by the skill need no definition of their own.
- **The user-level `mattpocock-skills:code-review` plugin skill.** Rejected: it exists only where that plugin is enabled (not in cloud sessions or other machines), so a missing skill silently degrades into self-review; its upgrades change behavior with no repo change; and its spec lookup doesn't find GitHub issues. The project skill is versioned with the repo.
- **CI review with `claude-code-action`.** Rejected for now: cost on every PR and feedback only after the push. It can be revisited.

## Consequences

- Triage by the implementer still reintroduces some bias; the recorded rejections are the counterweight.
- `feature-round` group subagents run the review themselves. When a subagent can't spawn subagents, the skill reports `REVIEW_UNAVAILABLE` instead of reviewing in its own context, and the `feature-round` session runs the review for that group.
- Review is a nudge, not a gate, for work done outside `feature`: `open-pr` suggests it when the branch shows no sign of it.
