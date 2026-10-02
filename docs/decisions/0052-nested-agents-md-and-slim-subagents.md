# 0052 - Agent Instructions: Nested AGENTS.md For Conventions, Subagents For Persona And Boundaries

## Status

Accepted

## Context

[ADR 0038](0038-adopt-role-scoped-subagents-reject-template.md) adopted role-scoped subagents and said each should point back to sections of the root `AGENTS.md`, which also served as the codemap. Since then the root file grew to ~280 lines and ~4,700 words loaded into every session, and package conventions ended up duplicated between it and the subagent definitions. The per-directory source layout it cited no longer exists; the subagents' own instructions say to explore the tree instead.

## Decision

- The root `AGENTS.md` is a slim index of repo-wide rules. Package-specific conventions live in nested `apps/api/AGENTS.md`, `apps/web/AGENTS.md` and `infra/AGENTS.md`, loaded when an agent works in that directory. Each directory's `CLAUDE.md` contains only `@AGENTS.md`, because Claude Code reads `CLAUDE.md` natively.
- Each convention has one home. Subagent definitions hold only persona, an orientation pointer, boundaries and hand-offs, definition of done, and the memory instruction. They don't restate conventions.
- `infra-engineer` owns `apps/api/src/env.ts` (schema and `.env.development` placeholder together); `api-engineer` only consumes `AppConfig`.
- There is no static codemap. Agents explore the tree directly.

This partially supersedes ADR 0038: its decision to add role-scoped subagents and to reject the rest of the template pattern stands; its instruction to point at root `AGENTS.md` sections and its reliance on source layout sections there do not.

## Consequences

- Always-loaded context shrinks, and package rules reach agents only when relevant.
- Changing a convention means editing one nested or root file, not a subagent definition.
- Delegation triggers (subagent descriptions) are unchanged.
