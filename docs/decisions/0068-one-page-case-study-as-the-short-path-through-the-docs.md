---
status: Accepted
area: process
amends: ["0065"]
---

# 0068 - A One-Page Case Study As The Short Path Through The Docs

## Status

Accepted. Amends [ADR 0065](0065-organize-human-docs-by-reader-moment.md): the "understand" moment gains a summary layer, and the docs index lists it first.

## Context

The human docs explain the project at two depths. The README says what the app does and how to run it; the detail pages (`docs/product.md`, the architecture overview and subsystem pages, the ADRs) explain everything else. The whole picture sits in between: product, architecture overview and engineering process add up to about 4,000 words over three pages written for engineers, with dozens of ADR links.

A reader who wants that picture in minutes, such as someone reading the repository as a portfolio next to others, has to assemble it alone, and what best shows the engineering (the constraints, the designs rejected after testing on a phone, how the project is run) is spread across those pages. The docs index also opens with operations, the moment least relevant to that reader.

## Decision

- **Add `docs/case-study.md`**: the whole project on one page, readable in about ten minutes. It covers the problem, the constraints, how the system works, the key decisions and their trade-offs, what was hard, how the project is run and its current limits. A reader who stops there has the complete picture; every section links deeper and none requires it.
- **It summarizes, it never owns a fact.** Each statement links the page or ADR that is its home, as the architecture overview does. A fact that would exist only in the case study goes into its home page first.
- **It follows the ADRs like `docs/architecture/` does** ([ADR 0062](0062-human-facing-architecture-docs.md)): a change that adds or amends an ADR altering something the page describes updates it in the same change. It names concepts, and avoids figures that drift on their own, such as counts and versions.
- **It is the first link a reader meets.** The README lists it first under its documentation links, after a short list of engineering highlights that points to it; `docs/README.md` lists it first under "Understand", which moves above "Operate".
- **The shape is borrowed, not invented**: the order of an engineering case study (problem, constraints, decisions, trade-offs, results) and of Simon Brown's software guidebook (context, constraints and principles before the architecture), and the C4 model's idea of zoom levels for different readers.

## Consequences

- The docs read at three depths: the README in a minute, the case study in about ten, the detail pages and ADRs as deep as needed. The docs index stays navigation, not a reading layer.
- One more page to keep current, bounded by the summary-only rule and the maintenance rule in the root `AGENTS.md`.
- Out of scope: a docs website, and rewriting the existing pages.
