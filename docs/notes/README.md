# Technical Notes

This directory holds research and alignment outcomes that are worth keeping for future implementation work but do not themselves authorize a change to the system.

A Technical Note (TN) is not an ADR. See [ADR 0039](../decisions/0039-adopt-technical-notes-for-non-decision-research.md) for why the two are kept separate:

- An **ADR** records an accepted decision — the code is expected to reflect it.
- A **TN** records a conclusion reached after research or discussion that does not (yet, or ever) change the system. It exists so the next person who investigates the same question does not redo the work, and so a "we looked into this and chose not to act" outcome is not lost.

TNs never carry authorization on their own. If a TN's conclusion later becomes something the project should act on, write an ADR that references the TN, and mark the TN as superseded.

## Using this directory

- File naming: `NNNN-kebab-case-title.md`, numbered sequentially like ADRs but in their own sequence.
- Use the [template](./TEMPLATE.md) for new notes.
- Add every new TN to the index below.
- Do not edit a TN's conclusions after the fact to reflect new information — write a new TN or an ADR, and link back.

## Index

- [0001 - Viewer Count Freshness and Rate-Limit Scalability](0001-viewer-count-freshness-and-rate-limit-scalability.md)
