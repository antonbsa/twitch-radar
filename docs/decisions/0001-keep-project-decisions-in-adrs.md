# 0001 - Keep Project Decisions In ADRs

## Status

Accepted

## Context

Project decisions had been captured across guidance, architecture, task, README, and POC documents. That made it easy for a decision to be updated in one place while stale rationale remained elsewhere.

## Decision

Accepted project decisions will live in `docs/decisions` as ADR-style Markdown files.

Other documents may link to ADRs, but they should not duplicate accepted decisions, rationale, or rejected alternatives.

## Consequences

- A new or changed decision requires adding or updating an ADR.
- Specs and task docs should describe goals, requirements, scope, and validation, while linking to ADRs for accepted choices.
- Reviews should treat decision text outside this directory as documentation drift.
