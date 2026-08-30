---
name: creating-pull-requests
description: Use when opening a pull request in this repo (gh pr create or the GitHub UI) - covers PR title convention, description structure, and required checklist (tests, migrations/config, specs/ADRs)
---

# Creating Pull Requests

## Overview

This repo's canonical PR structure lives in [.github/PULL_REQUEST_TEMPLATE.md](../../../.github/PULL_REQUEST_TEMPLATE.md) - GitHub auto-fills it for both humans and `gh pr create`. Don't duplicate its content here; read that file and fill it in.

## When to use

Before running `gh pr create`, or before a human opens a PR in the GitHub UI, for any change in this repo.

## What to do

1. Read `.github/PULL_REQUEST_TEMPLATE.md`. Its HTML comments are the instructions - resolve every comment into real content, don't leave placeholders or delete sections that apply.
2. Title: use the Conventional Commits prefix from this repo's commit message rules (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:` - see the project CLAUDE.md).
3. Checklist: check only boxes that are actually true. For anything unchecked, add a one-line reason (e.g. "manual only - no harness for push permission prompts"). This includes the migration/config and specs/ADR items, not just tests - if the PR touches `infra/migrations`, `wrangler.jsonc`, crons, or env vars, call it out in the Summary too. The "lint, typecheck, and relevant test suites pass locally" box is where a plain pass/fail confirmation belongs - don't write "tests pass" without having run them (see superpowers:verification-before-completion). 3a. Milestone: if the References section has a `Closes #123`/`Fixes #123`, read that issue's milestone (`gh issue view 123 --json milestone`) and set the same milestone on the PR (`gh pr edit --milestone ...` or via `gh pr create`). Today milestones are tracked on issues only - this keeps the PR carrying the same milestone marker instead of losing it at merge time. If the closed issue has no milestone, don't invent one - leave the PR's unset too.
4. Impact section: the specific effect, not the mechanism - name the capability/fix/behavior change precisely, then attach proof (command output, screenshots, benchmark results) only to substantiate that specific claim. Don't restate Summary. A bare test/lint pass confirmation ("typecheck passes", "97 tests pass") is not an effect - it belongs in the checklist box, not here; a proof line only belongs in Impact if it's backing a stated effect. Mark N/A for changes with no external effect (pure refactor, docs).
5. How to test section: reproduction steps for a reviewer, if applicable - instructions, not proof; the proof itself goes in Impact.
6. If there's no tracked issue and no spec/ADR link, delete the "References" section rather than leaving it empty.

## Common mistakes

- Filling in the summary but skipping the checklist entirely - it exists so reviewers don't have to ask "was this tested? did this touch a migration?"
- Checking "added tests" without having actually run them - verify before checking, don't assume.
- Restating the diff instead of the _why_ in the Summary section.
- Missing that a migration/config-touching change needs both the checklist box and a Summary mention - the box alone doesn't say what changed.
- Leaving the PR's milestone unset when it closes an issue that has one - the milestone should follow the issue onto the PR, not stay issue-only.
- Impact filled with test/lint pass confirmations instead of naming the concrete effect those tests prove - that confirmation belongs in the checklist's pass/fail box.
- Repro steps dumped into Impact instead of How to test - How to test holds instructions, Impact holds the outcome and its evidence.
