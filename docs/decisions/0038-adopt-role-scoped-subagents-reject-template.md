# 0038 - Adopt Role-Scoped Claude Code Subagents, Reject The Rest Of The Agent-Context-Template Pattern

## Status

Accepted

## Context

We evaluated the public template `Fernanda-Kipper/Agent-Context-Template` as a possible model for how this repo guides coding agents. It proposes: an `AGENTS.md` product overview, `.agents/ARCHITECTURE.md` (a narrative codemap), `.agents/GLOSSARY.md` (domain terms), `.agents/PLANS.md` (an "ExecPlan" methodology for self-contained living specs with mandatory Progress/Decision Log/Outcomes sections), role-based agent personas under `.agents/agents/` (backend-engineer, frontend-engineer, infrastructure-engineer, product-manager, cto), and reusable playbooks under `.agents/skills/`.

Comparing this against what already exists here:

- The per-directory source layout in [AGENTS.md](../../AGENTS.md) already functions as a codemap, at finer grain than the template's `ARCHITECTURE.md`.
- [docs/decisions](.) already is the single accepted-decision log, per [ADR 0001](0001-keep-project-decisions-in-adrs.md); the template's per-plan Decision Log would create a second, competing place decisions could live.
- `specs/mvp/` plus `specs/mvp/tasks/t-*.md` already provide living spec and phase-scoped task tracking, serving the same role as ExecPlans.
- `.claude/skills/` already exists for reusable playbooks, matching `.agents/skills/`.
- A domain glossary has low marginal value here: the domain vocabulary is mostly Twitch API/EventSub terminology, not project-specific jargon.

The one gap with no existing equivalent: this project has no project-specific Claude Code subagents. Delegated work currently falls back to the generic `Explore`, `general-purpose`, and `Plan` agents, which carry no built-in knowledge of this repo's stack or conventions.

## Decision

Add project-specific Claude Code subagents under `.claude/agents/`, scoped to this repo's actual engineering surfaces (e.g. an API-engineer persona for `apps/api` and a web-engineer persona for `apps/web`). Each subagent definition should point back to the relevant sections of [AGENTS.md](../../AGENTS.md) rather than duplicating its content.

Do not adopt the rest of the Agent-Context-Template pattern:

- No separate `ARCHITECTURE.md` or `GLOSSARY.md` — the source layout sections in `AGENTS.md` already serve that purpose.
- No ExecPlan methodology — `specs/mvp/tasks/t-*.md` plus this ADR directory already cover living-spec and decision-log needs; running both would give the project two decision-of-record locations, contradicting ADR 0001.
- No `cto.md` / `product-manager.md`-style stakeholder personas — this is a solo project with no separate stakeholder roles to simulate.

## Consequences

- New subagent definitions live under `.claude/agents/`, one per engineering surface, and must be kept in sync with `AGENTS.md`'s source layout sections when that structure changes.
- A future request to add ExecPlans, a standalone architecture/glossary doc, or additional stakeholder-style personas should be treated as scope creep unless a new ADR justifies it.
- Once created, delegated work can target these subagents by name instead of defaulting to the generic `Explore`/`general-purpose`/`Plan` agents for repo-shaped tasks.
