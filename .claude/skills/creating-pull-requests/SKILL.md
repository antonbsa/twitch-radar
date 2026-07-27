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
3. Checklist: check only boxes that are actually true. For anything unchecked, add a one-line reason (e.g. "manual only - no harness for push permission prompts"). This includes the migration/config and specs/ADR items, not just tests - if the PR touches `infra/migrations`, `wrangler.jsonc`, crons, or env vars, call it out in the Summary too.
4. Evidence section: paste real command output or describe the manual repro. Don't write "tests pass" without having run them (see superpowers:verification-before-completion).
5. If there's no tracked issue and no spec/ADR link, delete the "References" section rather than leaving it empty.

## Common mistakes

- Filling in the summary but skipping the checklist entirely - it exists so reviewers don't have to ask "was this tested? did this touch a migration?"
- Checking "added tests" without having actually run them - verify before checking, don't assume.
- Restating the diff instead of the *why* in the Summary section.
- Missing that a migration/config-touching change needs both the checklist box and a Summary mention - the box alone doesn't say what changed.
