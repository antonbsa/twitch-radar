# Technical Notes

This directory holds research and alignment outcomes that are worth keeping for future implementation work but do not themselves authorize a change to the system.

A Technical Note (TN) is not an ADR. See [ADR 0039](../decisions/0039-adopt-technical-notes-for-non-decision-research.md) for why the two are kept separate:

- An **ADR** records an accepted decision — the code is expected to reflect it.
- A **TN** records a conclusion reached after research or discussion that does not (yet, or ever) change the system. It exists so the next person who investigates the same question does not redo the work, and so a "we looked into this and chose not to act" outcome is not lost.

TNs never carry authorization on their own. If a TN's conclusion later becomes something the project should act on, write an ADR that references the TN, and mark the TN as superseded.

## Using this directory

- File naming: `NNNN-kebab-case-title.md`, numbered sequentially like ADRs but in their own sequence.
- Use the [template](./TEMPLATE.md) for new notes.
- Start the file with YAML frontmatter (see the template): `status` is `Informational`, `Explored, not adopted`, `Deferred` or `Superseded` and must match the first words of the `## Status` prose, with no `area`. Relations (`supersedes`, `superseded-by`, `related` to an ADR as `"ADR 0042"`) are optional and recorded on both files.
- The index below is generated: after adding a TN or changing its frontmatter, run `npm run docs:index`. `npm run check-docs` (and CI) fails on invalid frontmatter, a missing inverse relation or a stale index.
- Do not edit a TN's conclusions after the fact to reflect new information — write a new TN or an ADR, and link back.

## Index

<!-- docs-index:start -->

- [0001 — Viewer Count Freshness and Rate-Limit Scalability](0001-viewer-count-freshness-and-rate-limit-scalability.md) · Superseded · superseded by 0002
- [0002 — Viewer Count Cron Sufficiency for Twitch-Like Freshness](0002-viewer-count-cron-sufficiency-for-twitch-like-freshness.md) · Deferred · supersedes 0001
- [0003 — EventSub Subscription Cost of Broadening Monitoring Scope](0003-eventsub-subscription-cost-of-broadening-monitoring-scope.md) · Deferred
- [0004 — Follow Sync Latency Root Cause](0004-follow-sync-latency-root-cause.md) · Informational · see ADR 0042
- [0005 — Incremental Follow Sync Not Justified](0005-incremental-follow-sync-not-justified.md) · Explored, not adopted
- [0006 — Category Art In Push Notifications Not Justified](0006-category-art-in-push-notifications-not-justified.md) · Explored, not adopted
- [0007 — Client-Side Notification Digest Not Viable On iOS](0007-client-side-notification-digest-not-viable-on-ios.md) · Explored, not adopted · see ADR 0055

<!-- docs-index:end -->
