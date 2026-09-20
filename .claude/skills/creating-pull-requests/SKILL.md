---
name: creating-pull-requests
description: Use when opening a pull request in this repo (gh pr create or the GitHub UI) - covers PR title convention, sourcing the description from the branch's diff (and its handoff doc, when one exists), the required checklist, and the UI-change screenshot recipe
---

# Creating Pull Requests

## Overview

This repo's canonical PR structure lives in [.github/PULL_REQUEST_TEMPLATE.md](../../../.github/PULL_REQUEST_TEMPLATE.md) - GitHub auto-fills it for both humans and `gh pr create`. Don't duplicate its content here; read that file and fill it in.

## When to use

Before running `gh pr create`, or before a human opens a PR in the GitHub UI, for any change in this repo.

## What to do

1. Read `.github/PULL_REQUEST_TEMPLATE.md`. Its HTML comments are the instructions - resolve every comment into real content, don't leave placeholders or delete sections that apply.
2. Title: use the Conventional Commits prefix from this repo's commit message rules (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:` - see the project CLAUDE.md).
3. **Source the description from the diff against `main` (`git diff main...HEAD` or equivalent), not from memory of how the work went.** The diff is always the base source and is always available, regardless of how the branch came to be - this step does not depend on any other artifact existing. Check `.agents/handoff-<slug>.md` for this branch (written by `implementing-a-feature`'s step 6); most branches implemented through that skill will have one. When it exists, read it too - it carries the *why* (Objective/Problem, Design Decisions, Trade-offs) in the structure defined by [implementing-a-feature/HANDOFF_TEMPLATE.md](../implementing-a-feature/HANDOFF_TEMPLATE.md), which the diff alone doesn't give you. Use the diff to keep the handoff honest either way: every claim you write should correspond to something actually in the diff, and nothing meaningfully in the diff should go undescribed - the handoff can be stale in a way the diff never is (e.g. a later small fix it wasn't rewritten to cover). When there's no handoff at all (a small or ad hoc change, a manual fix, anything not implemented through `implementing-a-feature`), derive the description directly from the diff and the conversation - that is the normal path for such a change, not a fallback.
4. **Describe the branch's final state, not how it got there.** The Summary and Impact sections describe the diff against `main` as it stands now - never as a narrative of iteration ("first tried X, then switched to Y", "this replaces an earlier attempt at..."). A discarded approach belongs in the handoff's Design Decisions section (that's exactly what it's for), not in the PR. Do not add a standalone "Follow-ups" or "Next steps" list to the PR body either - if something surfaced during the work is worth tracking, open a GitHub issue for it (per the project's issue-driven workflow) and reference it in References, rather than itemizing it in the PR description.
5. Checklist: check only boxes that are actually true. For anything unchecked, add a one-line reason (e.g. "manual only - no harness for push permission prompts"). This includes the migration/config and specs/ADR items - if the PR touches `infra/migrations`, `wrangler.jsonc`, crons, or env vars, call it out in the Summary too, not just the checkbox. Do not add a lint/typecheck/test pass-fail recap anywhere in the PR (Summary, Impact, or a re-added checklist box) - CI enforces all of that on every push, and repeating "tests pass" here is exactly the kind of process narration excluded by rule 4, not a stated effect.
   - Milestone: if the References section has a `Closes #123`/`Fixes #123`, read that issue's milestone (`gh issue view 123 --json milestone`) and set the same milestone on the PR (`gh pr edit --milestone ...` or via `gh pr create`). Today milestones are tracked on issues only - this keeps the PR carrying the same milestone marker instead of losing it at merge time. If the closed issue has no milestone, don't invent one - leave the PR's unset too.
6. Impact section: the specific effect, not the mechanism - name the capability/fix/behavior change precisely, then attach proof (command output, screenshots, benchmark results) only to substantiate that specific claim. Don't restate Summary. Mark N/A for changes with no external effect (pure refactor, docs).
7. How to test section: reproduction steps for a reviewer, if applicable - instructions, not proof; the proof itself goes in Impact. Condense the handoff's How to Validate section into this when one exists; otherwise derive repro steps directly from the diff and the conversation.
8. **For any change with a visible UI effect, generate a screenshot and attach it to the PR (Impact, or Summary if it frames the problem better).** See "Screenshot recipe" below. Skip this for changes with no visible UI effect (backend-only, refactors, docs).
9. If there's no tracked issue and no spec/ADR link, delete the "References" section rather than leaving it empty.

## Screenshot recipe

The `tests/web/e2e` tier already has everything needed to get an authenticated, real-app screenshot without a manual login flow. Both the throwaway spec and its output image live under gitignored paths (`tests/web/e2e/scratch/`, `test-results/`), so there's no cleanup step - nothing here can end up committed.

1. Write the spec at `tests/web/e2e/scratch/<name>.spec.ts` (the `scratch/` directory is gitignored but still matches the tier's `tests/web/e2e/**/*.spec.ts` include glob, so it runs normally). Use the `authenticatedSession` fixture from `tests/web/e2e/setup/fixtures.ts` - it seeds a live session via the test seam and opens a real browser page already authenticated. Navigate to the screen you changed and call `page.screenshot({ path: "test-results/pr-screenshots/<name>.png" })`.
2. Run just that spec through the tier's own config so it gets the tier's `globalSetup` (`wrangler dev` + `vite dev`):
   ```bash
   npx vitest run --config vitest.e2e.config.ts tests/web/e2e/scratch/<name>.spec.ts
   ```
3. Attach the resulting image to the PR description. Leaving the spec file under `scratch/` is fine - it's gitignored and won't surface in `git status` or any future diff.

## Common mistakes

- Filling in the summary but skipping the checklist entirely - it exists so reviewers don't have to ask "was this tested? did this touch a migration?"
- Checking "added tests" without having actually run them - verify before checking, don't assume.
- Restating the diff instead of the _why_ in the Summary section.
- Missing that a migration/config-touching change needs both the checklist box and a Summary mention - the box alone doesn't say what changed.
- Leaving the PR's milestone unset when it closes an issue that has one - the milestone should follow the issue onto the PR, not stay issue-only.
- Writing the description from a handoff alone, without checking it against the actual diff - a handoff not rewritten after a late fix will describe a branch that no longer matches what's shipping.
- Treating "no handoff exists" as a blocker instead of the normal case for a small/ad hoc change - the diff and conversation are always enough to write the description from.
- Slipping iteration narrative ("initially implemented X, then removed it") or a follow-up/next-steps list into the PR body - both belong elsewhere (the handoff's Design Decisions, or a new GitHub issue), not in a description that's meant to describe the final diff.
- Padding Summary/Impact with a lint/typecheck/test pass confirmation - CI already proves that on every push; it adds nothing a reviewer needs.
- Repro steps dumped into Impact instead of How to test - How to test holds instructions, Impact holds the outcome and its evidence.
- Skipping the screenshot for a UI change - it's cheap to generate and there's no cleanup to skip it for.
