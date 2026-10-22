# 0065 - Organize Human Docs By Reader Moment, With Generated Indexes

## Status

Accepted. Amends [ADR 0062](0062-human-facing-architecture-docs.md) (the docs layout, beyond `docs/architecture/`) and [ADR 0043](0043-github-issues-as-spec-drop-mandatory-spec-docs.md) (the opt-in milestone overview under `specs/`).

## Context

The human docs have grown to about 120 KB of pages plus 64 ADRs, and a review on 2026-10-22 found drift that nothing catches: the ADR index listed ADR 0042 and 0054 under the wrong status, `docs/deployment.md` linked to a README section that no longer exists, `GLOSSARY.md` was not reachable from `docs/README.md`, and the README listed the closed MVP spec beside live docs.

The pages are flat beside `architecture/`, so a reader who arrives to do a task, recover from an incident or look up a fact finds the same list as one who wants to understand the system. Several facts live in more than one page and drift apart. `specs/` holds a closed MVP plan and one old milestone file that agents and readers still stumble into.

## Decision

- **Folders follow the reader's moment.** `docs/architecture/` to understand, `docs/guides/` to do a task, `docs/operations/` to operate or recover, `docs/reference/` to look up (the API contract, a link to `GLOSSARY.md`), and `docs/decisions/`, `docs/notes/` and `docs/history.md` as the record. `GLOSSARY.md` stays at the repo root because agents load it.
- **One home per fact.** Other pages and `AGENTS.md` link instead of restating. How-to and runbook pages hold only what to do and check; the explanation lives in `architecture/` or an ADR.
- **Flows about order or time get a Mermaid diagram**, as ADR 0062 already prescribes for architecture pages.
- **Indexes are generated.** The ADR and TN indexes are built from frontmatter metadata instead of hand-edited lists, and CI runs link, index and metadata checks from one script (`npm run check-docs`). Its first check is relative links and heading anchors across the documentation, the agent instructions and the README.
- **`specs/` is removed.** What it held is summarized in `docs/history.md` with permalinks to tag `v0.4.0`. A milestone that needs shared context puts it in the GitHub milestone description, not a file; this replaces the optional `specs/milestones/` overview in ADR 0043.
- **ADR bodies are not rewritten.** The only allowed edits are frontmatter, a wrong status, and the path of a link whose target moved.

## Consequences

- A reader picks a folder by what they are about to do, and a stale index or dead link fails CI instead of surviving a review.
- The restructure lands in later PRs (moves, the generator, the frontmatter, removing `specs/`); the link check goes first so every move is verified.
- Moving a page means updating links to it in the same change, including the `AGENTS.md` files that cite it.
- Out of scope: a docs website, rewriting ADRs, and external URL checking.
