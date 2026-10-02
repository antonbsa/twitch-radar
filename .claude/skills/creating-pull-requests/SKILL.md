---
name: creating-pull-requests
description: Use when opening a pull request in this repo (gh pr create or the GitHub UI).
---

# Creating Pull Requests

The canonical PR structure lives in [.github/PULL_REQUEST_TEMPLATE.md](../../../.github/PULL_REQUEST_TEMPLATE.md); GitHub auto-fills it for humans and `gh pr create`. Read it and fill it in. Use this before `gh pr create` or before a human opens a PR in the UI.

## What to do

1. Read `.github/PULL_REQUEST_TEMPLATE.md`. Its HTML comments are the instructions - resolve every comment into real content, don't leave placeholders or delete sections that apply.
2. Title: use the Conventional Commits prefix from this repo's commit message rules (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:` - see AGENTS.md "Commits").
3. **Source the description from the diff against `main` (`git diff main...HEAD`), not from memory of how the work went.**
   - The diff is the base source and always exists. With no handoff (small or ad hoc change), derive the description from the diff and the conversation; that is the normal path.
   - If `.agents/handoff-<slug>.md` exists for this branch (written by `implementing-a-feature` step 7), read it too: it carries the *why* (Objective/Problem, Design Decisions, Trade-offs) in the structure of [HANDOFF_TEMPLATE.md](../implementing-a-feature/HANDOFF_TEMPLATE.md).
   - Use the diff to keep the handoff honest: every claim must correspond to something in the diff, and nothing meaningfully in the diff should go undescribed. A handoff can be stale in a way the diff never is.
4. **Describe the branch's final state, not how it got there.** The Summary and Impact sections describe the diff against `main` as it stands now - never as a narrative of iteration ("first tried X, then switched to Y", "this replaces an earlier attempt at..."). A discarded approach belongs in the handoff's Design Decisions section (that's exactly what it's for), not in the PR. Do not add a standalone "Follow-ups" or "Next steps" list to the PR body either - if something surfaced during the work is worth tracking, open a GitHub issue for it (per the project's issue-driven workflow) and reference it in References, rather than itemizing it in the PR description.
5. Checklist: check only boxes that are actually true. For anything unchecked, add a one-line reason (e.g. "manual only - no harness for push permission prompts"). This includes the migration/config and specs/ADR items - if the PR touches `infra/migrations`, `wrangler.jsonc`, crons, or env vars, call it out in the Summary too, not just the checkbox. Do not add a lint/typecheck/test pass-fail recap anywhere in the PR (Summary, Impact, or a re-added checklist box) - CI enforces all of that on every push, and repeating "tests pass" here is exactly the kind of process narration excluded by rule 4, not a stated effect.
   - Milestone: if the References section has a `Closes #123`/`Fixes #123`, read that issue's milestone (`gh issue view 123 --json milestone`) and set the same milestone on the PR (`gh pr edit --milestone ...` or via `gh pr create`). Today milestones are tracked on issues only - this keeps the PR carrying the same milestone marker instead of losing it at merge time. If the closed issue has no milestone, don't invent one - leave the PR's unset too.
   - Labels: apply them when opening the PR (`gh pr create --label ...` or `gh pr edit --add-label ...`), not only when asked: `migration` if it touches `infra/migrations`; `config` if it touches `apps/api/wrangler.jsonc`, `crons.ts`, or `env.ts`; plus the default label (`bug`, `enhancement`, `documentation`). These drive the categorized release notes in [.github/release.yml](../../../.github/release.yml): an unlabeled PR silently lands in "Other Changes", and `migration`/`config` have no category of their own - `preparing-a-release` calls out that risk in the notes' prose instead.
6. Impact section: the specific effect, not the mechanism - name the capability/fix/behavior change precisely, then attach proof (command output, screenshots, benchmark results) only to substantiate that specific claim. Don't restate Summary. Mark N/A for changes with no external effect (pure refactor, docs).
7. How to test section: reproduction steps for a reviewer, if applicable - instructions, not proof; the proof itself goes in Impact. Condense the handoff's How to Validate section into this when one exists; otherwise derive repro steps directly from the diff and the conversation.
8. **For any change with a visible UI effect, generate a screenshot and attach it to the PR (Impact, or Summary if it frames the problem better).** Follow [SCREENSHOTS.md](SCREENSHOTS.md). Skip this for changes with no visible UI effect (backend-only, refactors, docs).
9. If there's no tracked issue and no spec/ADR link, delete the "References" section rather than leaving it empty.

## Common mistakes

- Checking "added tests" without having run them.
- Restating the diff instead of the _why_ in the Summary.
- Mentioning a migration/config change only in the checklist box: the Summary must say what changed.
- Leaving the milestone unset when the closed issue has one.
- Writing the description from a handoff alone, without checking it against the diff.
- Iteration narrative or a follow-up list in the body: the former belongs in the handoff's Design Decisions, the latter in a GitHub issue.
- Repro steps in Impact instead of How to test.
