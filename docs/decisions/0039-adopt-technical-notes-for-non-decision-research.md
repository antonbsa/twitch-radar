# 0039 - Adopt Technical Notes For Non-Decision Research

## Status

Accepted

## Context

Some discussions reach a researched, aligned conclusion that is worth preserving for future implementation work, but that conclusion does not authorize any current change to the system — e.g. "we looked into X, confirmed it works this way, and decided not to act on it now" or "we considered Y and rejected it, but the reasoning should survive so it isn't re-litigated."

[ADR 0001](0001-keep-project-decisions-in-adrs.md) reserves `docs/decisions` for accepted decisions and says other documents should not carry rationale or rejected alternatives inline. That leaves no place for a researched conclusion that isn't a decision — writing it as an ADR would misrepresent it as authorizing action, and dropping it entirely loses the research.

## Decision

Non-decision research and alignment outcomes are captured as Technical Notes (TNs) in `docs/notes`, numbered independently from ADRs, following the template in `docs/notes/TEMPLATE.md`. See `docs/notes/README.md` for the full definition and usage rules.

TNs never authorize a change on their own. If a TN's conclusion is later acted on, an ADR is written referencing the TN, and the TN is marked superseded.

## Consequences

- A researched conclusion that isn't an accepted decision goes in `docs/notes`, not as an ADR and not left undocumented.
- ADRs may link to TNs for background, instead of restating the research.
- Reviews should treat a TN written to justify a current change as documentation drift — that belongs in an ADR instead.
