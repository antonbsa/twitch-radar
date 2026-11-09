---
name: implement
description: Use when asked to implement a GitHub issue, local issue file or spec in this repo, feature or bug fix, before writing any code.
---

# Implement

This session is the **coordinator**: it scopes the work with the user, hands each issue to an `implementer` subagent in its own worktree, then runs the review and writes the handoff. Independent slices run in parallel. The implementer's model and effort live in its definition (`.claude/agents/implementer.md`), so a dispatch passes only `subagent_type: "implementer"`.

## Where this runs

- Steps 1-3 read and talk. Creating GitHub issues and `.agents/` files writes no tracked file, so the coordinator may run in the `main` checkout.
- Every implementation runs in a worktree created by step 4, off the latest `origin/main`. `guard-write.mjs` denies tracked writes in a `main` checkout.
- **Follow-up** on an existing branch (review comments, a requested fix): the session runs inside that branch's worktree, or the user names it. That worktree is the item's; skip step 4, dispatch the implementer there with the requested changes, classify each with AGENTS.md "Follow-up Changes", then continue from step 6.

## What to do

1. **Load the input and pick the items.**
   - GitHub issue: `gh issue view <number>`, then `npm run issues:slices -- ready <number>`. It prints the issue's open sub-issues, split into `ready` (no open blocker) and `blocked`. With sub-issues, the items are the `ready` ones and the issue itself is their parent. Without any, the item is the issue itself.
   - Local issue file (`.agents/issues/*.md`): read it directly. It is the item.
   - Every open sub-issue `blocked`: report which blockers they wait on and stop.

   Done when every item is loaded and every `blocked` sub-issue is noted for the step 8 report.

2. **Check each item is spec-shaped and one slice.** Spec-shaped means a goal or problem, a resolved solution or scope, and acceptance criteria (ADR 0043). An underspecified item (a bug title with no proposed fix, an idea with no scope boundary) gets its open scope resolved with the user first, in chat or in the milestone description. One slice means its acceptance criteria can't ship separately (AGENTS.md "One Concern Per PR"). If they can, propose a split and wait. The answer that accepts a split also authorizes dispatching its ready slices. On acceptance:
   - Create one spec-shaped issue per slice with the original's milestone: `gh issue create --milestone <name> --title ... --body-file ...`. Context shared by all slices goes in the original's body (or the milestone description), not in each slice.
   - Link each slice: `npm run issues:slices -- link <original> <slice> [--blocked-by <slice it needs first>]...`. The native sub-issue and "blocked by" links are the split's only record. A dependency is a slice needing another slice's work to exist first (a shared type, endpoint, migration).
   - Return to step 1 with the original issue: its ready slices become the items.
   - Local issue file: write one file per slice under `.agents/issues/`, with a `Depends on <file>` line where one applies. The items are the slices with no such line.

3. **Resolve every open question before coding.** Across all items, find the unresolved ones: "TBD"/"open question" markers, unchosen design options, ambiguous acceptance criteria, anything phrased as a question. For a bug whose cause is unconfirmed, the repro is part of the implementer's work, not a question. Ask in rounds. A round carries every question whose answer doesn't hang on another open question, grouped by item, each with a concrete recommended resolution and its reasoning: AskUserQuestion for up to four multiple-choice questions, plain chat otherwise. After each round, re-scan every item: an answer can settle other questions, raise new ones, or change the scope or the split (back to step 2). A resolution that is an accepted decision the code must keep following needs an ADR ([ADR 0001](../../../docs/decisions/0001-keep-project-decisions-in-adrs.md)): flag it, and the implementer writes it. If no item has an open question, say so and continue. Done when a re-scan after the last round finds no open question in any item; dispatch nothing earlier.

4. **Create one worktree per item.** Name the branch after the work (AGENTS.md "Worktrees and `.agents/`") and run `npm run worktree:create -- <branch>` from any checkout. It validates the name, branches off the latest `origin/main`, installs dependencies, and prints the absolute path as its last line. Done when every item has a path; a failure (name taken, install broken) is resolved here, before any dispatch.

5. **Dispatch one `implementer` per item, all in one message.** Each prompt carries:
   - the item (issue number or file path) and its worktree's absolute path;
   - every step 3 resolution for that item, stated as decided, and any ADR to write.

   A `BLOCKED` report goes to the user; the answer goes back to that implementer through SendMessage. Done when every implementer has reported `DONE`.

6. **Review each item.** Run the [review](../review/SKILL.md) skill once per item, with its worktree path and issue number or file. Triage every finding with AGENTS.md "Follow-up Changes": send the one-off corrections to that item's implementer through SendMessage, and propose conventions to the user. Done when every finding is fixed or rejected with a one-line reason and the implementer has reported `DONE` again.

7. **Write (or rewrite) each item's handoff.** Write `<worktree>/.agents/handoff-<slug>.md` (slug from the issue name), following [HANDOFF_TEMPLATE.md](HANDOFF_TEMPLATE.md). Overwrite an existing one in full, so it always describes the branch's current state, never its history. Sources: the issue for Objective and Scope; the implementer's report for Changes, Tests and Manual validation; step 3's resolutions, the implementer's Decisions and every finding rejected in step 6 for Design Decisions. Omit a section entirely when nothing in it applies.

8. **Report and stop.** One summary, with one entry per item: issue, branch, worktree path, handoff path, status, and the implementer's proposed issues. Then list every `blocked` sub-issue with the blockers it waits on; a later run on the parent picks it up once they close. End each item with a fenced `bash` block holding only `code -r <worktree path>`, so the desktop app's Run button opens it. The work stays uncommitted in its worktree, and the user stages and commits it.

## Common mistakes

- Leaving an accepted split only in chat: a later session sees the split only through the issues and their links.
- Implementing in the coordinator's own context: every implementation goes to an `implementer`, even a single item.
- Passing `model` or `effort` on the dispatch: the agent definition is their single source of truth.
- Dispatching settled items while another item still waits on an answer: the gate in step 3 covers all items.
- Using the Agent tool's `isolation: "worktree"`: it can't target `.agents/worktrees/<branch>`. Create the worktree with step 4 and pass its path.
- Passing the handoff or your reasoning to the review: the review skill builds its reviewers' inputs itself.
