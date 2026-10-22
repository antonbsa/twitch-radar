# 0062 - Human-Facing Architecture Documentation

## Status

Accepted. Amended by [ADR 0065](0065-organize-human-docs-by-reader-moment.md): the docs layout and the generated indexes. Supersedes in part [ADR 0038](0038-adopt-role-scoped-subagents-reject-template.md): its rejection of a standalone architecture document no longer holds for a document written for people. [ADR 0052](0052-nested-agents-md-and-slim-subagents.md) stands: agents still get no codemap.

## Context

The project's reasoning is spread over dozens of ADRs, a handful of technical notes, `docs/api-contract.md`, `docs/deployment.md`, a README that mixed the pitch with developer setup, and `specs/mvp/00. architecture.md`, a plan that is closed to new work and so drifts from the code as milestones land. ADRs record one decision each, several are superseded or refined by later ones, and none describes the system as a whole. Nothing explains how the pieces fit, or why, to someone reading the repository, which is also meant to serve as a portfolio.

ADR 0038 rejected a separate `ARCHITECTURE.md`, and ADR 0052 keeps "no static codemap". Both were about agent context: a file map that drifts and duplicates `AGENTS.md`. A conceptual document for human readers is a different audience that neither considered.

## Decision

Add `docs/architecture/`: an overview and one page per subsystem (auth and sessions, follow sync, monitoring and EventSub, state transitions and matching, notification delivery, scheduled jobs, observability, testing, deploy and release), plus a page summarizing how the project is run.

- **Audience.** Humans reading the repository, including as a portfolio. It is not agent context, and agents are not expected to load it; their conventions stay in the `AGENTS.md` files.
- **Abstraction level.** Components and modules by concept (the Worker, the queues, scheduled jobs, a feature as a pattern), explaining the current flow and the reasoning as a narrative. No file-by-file maps, directory layouts or source paths that a refactor would break: a restructure with no decision change must need no edit to `docs/architecture/`. Diagrams are Mermaid, so GitHub renders them and they are diffable.
- **What stays elsewhere.** Coding conventions remain in the `AGENTS.md` files, one home per convention (ADR 0052). ADRs remain the record of individual decisions: the pages link the ADR and any relevant technical note, such as a rejected alternative, instead of restating them. A superseded design appears only where its history explains a non-obvious choice.
- **Maintenance rule.** A change that adds or amends an ADR altering a flow, component or trade-off described in `docs/architecture/` updates that page in the same change. Because the pages name concepts rather than files, refactors without a decision change don't touch them. The rule is in the root `AGENTS.md`.

## Consequences

- There is one place to read how the system works end to end, with a link to the ADR behind each decision.
- ADR 0038's Status notes the partial supersession; its decision to add role-scoped subagents is unchanged.
- A new decision costs one more place to keep current, bounded by the rule above and the abstraction level.
- Where an ADR and a page disagree, the page is stale: ADRs remain the source of truth for decisions, and the code for behavior.
- Out of scope: rewriting or consolidating ADRs and technical notes, a generated API reference beyond `docs/api-contract.md`, a docs website, and any codemap or file-level layout document for agents.
