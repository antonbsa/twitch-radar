---
name: open-pr
description: Use when opening a pull request in this repo (gh pr create or the GitHub UI).
---

# Creating Pull Requests

The canonical PR structure lives in [.github/PULL_REQUEST_TEMPLATE.md](../../../.github/PULL_REQUEST_TEMPLATE.md); GitHub auto-fills it for humans and `gh pr create`. Read it and fill it in. Use this before `gh pr create` or before a human opens a PR in the UI.

## Before you start

Check the branch's state before writing anything; each check either passes silently or gets reported to the user.

- **Not on `main`.** If `git branch --show-current` prints `main`, stop: PRs come from a feature branch in a worktree (AGENTS.md "Worktrees and `.agents/`").
- **Uncommitted changes.** If `git status --porcelain` lists tracked changes, ask whether they belong in this PR. Never commit them silently, and never stash or discard them.
- **Behind `main`.** Run `git fetch origin main`. If `git rev-list --count HEAD..origin/main` is non-zero, check `git merge-tree --write-tree origin/main HEAD`: a non-zero exit means conflicts, so tell the user and resolve them (with their go-ahead) before opening. Being behind without conflicts is fine; just mention it.
- **Pushed.** Once the concern check (rule 1) is settled, and right before `gh pr create`: if the branch has no upstream or is ahead of it, push with `git push -u origin HEAD`.
- **Existing PR.** Run `gh pr view --json url,state,isDraft`. If an open PR already exists for the branch, update it (`gh pr edit` for title, body and labels) instead of creating a second one, and apply the rules below to the updated body.

## Scan the diff for leftovers

Before describing the diff, scan what it adds for things that shouldn't ship:

```bash
git diff origin/main...HEAD -U0 | grep -nE '^\+.*(console\.log|debugger|\.only\(|TODO|FIXME)'
git diff --name-only --diff-filter=A origin/main...HEAD
```

- Debug output (`console.log`, `debugger`) and focused tests (`.only(`, which makes CI skip the rest of the file).
- A new `TODO`/`FIXME` with no issue reference: open the issue and reference it, or drop the comment.
- Added files that look accidental: screenshots, scratch scripts, anything that should be under the gitignored `.agents/`.
- Secrets or real values copied from `.env.local` into a committed file.

Judge each hit: `console.log` in `infra/scripts` is often intended output. Report what you found and ask before removing anything; don't edit silently.

## What to do

1. **Map the branch to concerns first.** Run `git log --oneline origin/main..HEAD` and assign each commit to a concern per AGENTS.md "One Concern Per PR". If the commits cover independent concerns, stop before `gh pr create` and propose a split: list each concern with its commits and a suggested branch name, then wait for the user's answer. It's a question, not a block: the user may choose to open as-is. On an accepted split, record it in git: one branch and worktree per concern, each created with `npm run worktree:create -- <branch>` and holding its commits via `git cherry-pick`. A concern the original issue doesn't cover also gets an issue (milestone per AGENTS.md "Workflow" step 1). Push and open the PRs only when the user asks.
2. Read `.github/PULL_REQUEST_TEMPLATE.md`. Its HTML comments are the instructions - resolve every comment into real content, don't leave placeholders or delete sections that apply.
3. Title: use the Conventional Commits prefix from the root `AGENTS.md` "Commits" section (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`).
   - Add `!` after the prefix (`feat!:`, `fix!:`) when the change breaks something already in use: the HTTP surface in [api-contract.md](../../../docs/reference/api-contract.md) as an installed PWA still calls it, push payloads a deployed service worker parses, or a stored data format. A breaking change is a one-way door, so Merge risk says what breaks and how to recover (rule 8).
4. **Source the description from the diff against `main` (`git diff main...HEAD`), not from memory of how the work went.**
   - The diff is the base source and always exists. With no handoff (small or ad hoc change), derive the description from the diff and the conversation; that is the normal path.
   - If `.agents/handoff-<slug>.md` exists for this branch (written by `implement`'s handoff step), read it too: it carries the *why* (Objective/Problem, Design Decisions, Trade-offs) in the structure of [HANDOFF_TEMPLATE.md](../implement/HANDOFF_TEMPLATE.md).
   - Use the diff to keep the handoff honest: every claim must correspond to something in the diff, and nothing meaningfully in the diff should go undescribed. A handoff can be stale in a way the diff never is.
5. **Describe the branch's final state, not how it got there.** The Summary and Impact sections describe the diff against `main` as it stands now - never as a narrative of iteration ("first tried X, then switched to Y", "this replaces an earlier attempt at..."). A discarded approach belongs in the handoff's Design Decisions section (that's exactly what it's for), not in the PR. Do not add a standalone "Follow-ups" or "Next steps" list to the PR body either - if something surfaced during the work is worth tracking, open a GitHub issue for it (per the project's issue-driven workflow) and reference it in References, rather than itemizing it in the PR description.
   - **Flow changes get one small visual in the Summary.** Only when the PR changes a flow (a request path, cron → sync → notification, Channel State transitions), add the smallest visual that shows the changed part: a call tree in a code block, or a Mermaid `sequenceDiagram` or `stateDiagram-v2` (GitHub renders them). Show only the steps that changed plus enough context to place them, next to a sentence of prose. No visual for anything else; UI changes use screenshots (rule 10).
   - **Write in the project's vocabulary, briefly.** Use the [GLOSSARY.md](../../../GLOSSARY.md) terms (Channel State, Snapshot, Event, Stale Event, State Change) exactly as defined, not synonyms. No preamble ("This PR..."); lead each section with its content.
6. Checklist: check only boxes that are actually true. For anything unchecked, add a one-line reason (e.g. "manual only - no harness for push permission prompts"). This includes the migration/config and ADR/docs items - if the PR touches `infra/migrations`, `wrangler.jsonc`, crons, or env vars, call it out in the Summary too, not just the checkbox. Do not add a lint/typecheck/test pass-fail recap anywhere in the PR (Summary, Impact, or a re-added checklist box) - CI enforces all of that on every push, and repeating "tests pass" here is exactly the kind of process narration excluded by rule 5, not a stated effect.
   - Milestone: if the References section has a `Closes #123`/`Fixes #123`, read that issue's milestone (`gh issue view 123 --json milestone`) and set the same milestone on the PR (`gh pr edit --milestone ...` or via `gh pr create`). Today milestones are tracked on issues only - this keeps the PR carrying the same milestone marker instead of losing it at merge time. If the closed issue has no milestone, don't invent one - leave the PR's unset too.
   - Labels: apply them when opening the PR (`gh pr create --label ...` or `gh pr edit --add-label ...`), not only when asked: `migration` if it touches `infra/migrations`; `config` if it touches `apps/api/wrangler.jsonc`, `crons.ts`, or `env.ts`; plus the default label (`bug`, `enhancement`, `documentation`). These drive the categorized release notes in [.github/release.yml](../../../.github/release.yml): an unlabeled PR silently lands in "Other Changes", and `migration`/`config` have no category of their own - `release` calls out that risk in the notes' prose instead.
7. Impact section: the specific effect, not the mechanism - name the capability/fix/behavior change precisely, then attach proof (command output, screenshots, benchmark results) only to substantiate that specific claim. Don't restate Summary. Mark N/A for changes with no external effect (pure refactor, docs).
   - For a bug fix, the strongest proof is the test that fails on `main` and passes on the branch: name it and show the assertion that pins the bug in a short snippet. That is evidence for the specific fix, not a test recap (rule 6), so never paste a full run log or "all tests pass".
8. Merge risk section: one line with reversibility (two-way or one-way door) and a one-word blast radius, never omitted (docs-only is "Two-way door · Blast radius: docs"). A PR labeled `migration` is a one-way door by default (the label means irreversible in prod) and must say how to recover; a PR labeled `config` names any manual step the deploy depends on (a secret to set, a cron that changes schedule). Add ramification bullets only for real, specific risks, not a generic list.
9. How to test section: reproduction steps for a reviewer, if applicable - instructions, not proof; the proof itself goes in Impact. Condense the handoff's How to Validate section into this when one exists; otherwise derive repro steps directly from the diff and the conversation.
10. **For any change with a visible UI effect, generate a screenshot and attach it to the PR (Impact, or Summary if it frames the problem better).** Follow [screenshot](../screenshot/SKILL.md); capture with `npm run pr:screenshot` and upload with `npm run pr:image` (it prints the Markdown to paste), laid out as a table per its "Layout in the PR description" section. Skip this for changes with no visible UI effect (backend-only, refactors, docs).
11. If there's no tracked issue and no spec/ADR link, delete the "References" section rather than leaving it empty.
12. Open as a draft (`gh pr create --draft`) when a checklist box is unchecked because the work isn't done yet (as opposed to not applying), or when the user says it's still in progress. Say so in the reply, and mark it ready with `gh pr ready` once the gap is closed.

## Review check

If the branch shows no sign of `implement`'s isolated review (no `.agents/handoff-<slug>.md` usually means ad hoc work outside `implement`), suggest running the [review](../review/SKILL.md) skill first. It is a nudge, not a gate.

## Common mistakes

- Running `gh pr create` on a branch that already has an open PR, or from an unpushed branch.
- Opening with a leftover `.only(`, `debugger` or stray file in the diff.
- Leaving an accepted split only in chat: a later session can't see it. Each concern gets its own branch (and issue) before this session ends.
- Checking "added tests" without having run them.
- Restating the diff instead of the _why_ in the Summary.
- Mentioning a migration/config change only in the checklist box: the Summary must say what changed.
- Leaving the milestone unset when the closed issue has one.
- Writing the description from a handoff alone, without checking it against the diff.
- Iteration narrative or a follow-up list in the body: the former belongs in the handoff's Design Decisions, the latter in a GitHub issue.
- Repro steps in Impact instead of How to test.
- A `migration` PR marked as a two-way door, or with no recovery path.
- Claiming an image can't be attached via `gh`, or linking a local/gitignored screenshot path: `npm run pr:image` uploads it and prints a URL that renders for everyone.
