---
name: preparing-a-release
description: Use when preparing a production release in this repo - picking the version, drafting release notes, or answering "what shipped since the last release" / "how do I deploy to production". Creates the release as a draft; never publishes it.
---

# Preparing a Release

## Overview

Publishing a GitHub release **is** the production deploy in this repo - [`deploy-release.yaml`](../../../.github/workflows/deploy-release.yaml) triggers on `release: published`, re-runs the full suite against the tag, applies pending D1 migrations against `twitch-radar-prod`, then deploys ([ADR 0041](../../../docs/decisions/0041-release-gated-production-deploys.md)). There is no other path to production. This skill prepares everything a release needs - version, labels, risk call-outs, the `CHANGELOG.md` entry - and, once the human accepts the drafted entry, commits it to `main`, tags, and creates the release itself **as a draft**. Publishing (flipping draft → published) stays a deliberate human action this skill never takes.

The root [`CHANGELOG.md`](../../../CHANGELOG.md) is the source of truth for the user-facing part of release notes ([ADR 0049](../../../docs/decisions/0049-changelog-as-source-of-truth-for-release-notes.md)) - it is what the in-app "What's New" sheet shows. It is authored and committed to `main` first, before tagging. The GitHub Release body is that entry with GitHub's PR-label-generated list appended (`--notes` + `--generate-notes`), so the engineering account (`.github/release.yml`'s five categories) is generated, never hand-copied into the file. Your job is the part nothing can do for you: deciding the version, keeping labels right, and translating merged PRs into a few plain-language bullets a user of the PWA would understand.

## When to use

Cutting a production deploy, drafting release notes, or picking the next version number. Not for preview deploys - those happen automatically on push to `main`, no release involved.

## What to do

1. **Find the baseline.** `git fetch --tags && git describe --tags --abbrev=0` for the last tag. If there are no tags yet, the first release is `v0.1.0` (ADR 0041 - SemVer with major pinned at 0 while the MVP is under development; `package.json` has no `version` field - the git tag is the sole source of truth for what's deployed, `CHANGELOG.md`'s latest heading is the source of truth for what the in-app widget shows, and a release entry keeps the two in lockstep by construction).

2. **Gather the range.** `git log <last-tag>..main --no-merges --pretty="%h %s"` for the commits, and `gh pr list --state merged --base main --limit 50 --json number,title,labels,mergedAt` for the PRs. Read the commits, not just the PR titles - merge commits hide the Conventional Commit prefixes that tell you what kind of change each one is.

3. **Validate every PR in range has a label.** `.github/release.yml` categorizes purely on labels (see "Labels" below) - an unlabeled PR silently lands in "Other Changes" of the generated notes instead of the risk-flagged category it belongs in. For every merged PR since the last tag with an empty `labels` array:
   - Read its changed files (`gh pr view <n> --json files`) and title/commit prefixes.
   - Apply `migration` if it touches `infra/migrations`, `config` if it touches `apps/api/wrangler.jsonc` / `apps/api/src/crons.ts` / `apps/api/src/env.ts`, plus the applicable default (`bug` for `fix:`, `enhancement` for `feat:`, `documentation` for `docs:`) - same rule as `CLAUDE.md`'s PR-opening step.
   - `chore:`/`refactor:`/`test:`-prefixed PRs that touch none of the risk paths above have no correct default label - leave them unlabeled (they correctly fall into "Other Changes", which exists precisely so unlabeled work isn't dropped, not miscategorized into something it isn't).
   - Present the suggested labels to the human before applying (`gh pr edit <n> --add-label "..."`) - this rewrites shared PR metadata, not local draft state.

4. **Check the three things that make a release risky**, and name each one explicitly in a short "Deploy notes" paragraph for the GitHub Release body if present (step 9) - not in `CHANGELOG.md`, whose readers are users, not operators:
   - New files in `infra/migrations` - irreversible against production D1. Say which tables/columns change.
   - Changes to `apps/api/wrangler.jsonc`, `apps/api/src/crons.ts`, or the env schema in `apps/api/src/env.ts` - a new binding, cron, or required env var must be provisioned before the deploy, or the Worker breaks on boot.
   - Changes to `apps/web/public/service-worker.js` or the push/subscription contract - installed PWAs hold a cached service worker; a contract change can silently break notifications on devices already out there. Doesn't apply to the very first release (no devices out there yet).

5. **Pick the version.** While major is pinned at 0: breaking change to a stored contract (push subscription shape, API response consumed by the deployed PWA) → minor bump. Everything else → patch bump. Say in one line why you chose it.

6. **Draft the `CHANGELOG.md` entry and show it to the human before writing anything.** This is user-facing copy for the in-app "What's New" sheet, not a PR list:
   - Read each PR in range (title, description, diff when the title is vague) and ask: would someone using the PWA notice this? Drop anything they wouldn't - docs, ADRs, CI, tests, refactors, dev tooling, preview-only fixes. Several PRs can collapse into one bullet; one PR can be dropped entirely.
   - Sort what's left into up to three sections, in this order, omitting empty ones: `### New` (something a user can do that they couldn't before), `### Improved` (an existing thing works better or faster), `### Fixed` (something that was broken now works).
   - Write each bullet as one plain sentence from the user's point of view, naming things as the UI names them ("followed channels", "alerts", "sign in with Twitch"), not as the code does ("follow sync", "EventSub", "OAuth callback"). No PR numbers, links, commit prefixes (`feat:`/`fix:`), or backticked identifiers.
   - Optionally add a one-to-two sentence summary right under the heading when the release has a theme worth stating (e.g. a first release). Skip it otherwise.
   - If nothing in range is user-visible, the entry is the heading alone - the sheet shows a "no user-facing changes" placeholder for it.
   - English regardless of the conversation's language, matching every other artifact in this repo.
   - New heading: `## vX.Y.Z — <publish date, YYYY-MM-DD>`, inserted above the previous top entry (below any `## Unreleased` section, which this skill doesn't manage or remove).

7. **Once the human approves the entry, commit it to `main` and push - this must land before tagging.**

   ```sh
   git add CHANGELOG.md
   git commit -m "docs: add CHANGELOG entry for vX.Y.Z"
   git push origin main
   ```

   This is the first artifact of the release, not a byproduct of it (ADR 0049) - the tag and the GitHub Release both point at the commit that adds this entry.

8. **Confirm the target commit is on the remote.** `git rev-parse HEAD` vs `git rev-parse origin/main` (after `git fetch origin`) - the push in step 7 should already cover this, but re-check before tagging. If `main` is still ahead of `origin/main` for any reason, `gh release create` will fail against an unpushed SHA (observed as a bare `HTTP 500` with no useful message, not a clean validation error).

9. **Create the release as a draft - body is the committed `CHANGELOG.md` entry (plus deploy notes from step 4, if any), with GitHub's generated PR list appended; title is the version string alone (`v0.1.0`, not `v0.1.0 - <name>`):**

   ```sh
   gh release create v0.1.0 --target <sha> --title "v0.1.0" --draft --generate-notes \
     --notes "<the vX.Y.Z section body from CHANGELOG.md, heading stripped>

   <deploy notes, if any>"
   ```

   `--generate-notes` produces the categorized "What's Changed" list from PR labels, and `--notes` is prepended above it - the user-facing entry on top, the engineering list below, neither copied into the other.

10. **Return the draft's URL and stop.** That's the artifact for human review and manual publish (UI button, or `gh release edit <version> --draft=false`) - never call `--draft=false` or otherwise flip it to published yourself.

## Labels

`.github/release.yml` categorizes on labels. `bug`, `enhancement`, and `documentation` exist by default; `migration`, `config`, and `skip-changelog` do not. Create them once:

```sh
gh label create migration --color d93f0b --description "Touches infra/migrations - irreversible in prod"
gh label create config --color d93f0b --description "Touches wrangler.jsonc, crons, or env vars"
gh label create skip-changelog --color ededed --description "Omit from generated release notes"
```

Unlabeled PRs still appear, under "Other Changes" - the catch-all category exists so nothing is silently dropped.

## Common mistakes

- Publishing the release yourself (`--draft=false`, or clicking Publish). Creating the draft is this skill's job; flipping it live ships to production, and that decision stays with the human.
- Tagging or creating the release before the `CHANGELOG.md` entry is committed to `main`. The entry is the source of truth for user-facing notes (ADR 0049) and the first artifact of the release.
- Copying PR titles into `CHANGELOG.md` (`fix: batch D1 queries (#44)`). That list already comes from `--generate-notes` in the GitHub Release; the file is what users read in the app and must be plain language with no PR references.
- Running `--generate-notes` without `--notes`, or `--notes` without `--generate-notes`. The release body needs both halves: the user-facing entry and the generated engineering list.
- Creating the draft before the human has approved the `CHANGELOG.md` entry. Show the drafted entry first; only step 7 commits it, and only step 9 touches `gh release create`.
- Tagging a commit that isn't on `main`, isn't pushed to `origin/main` yet, or whose preview deploy hasn't been exercised. Preview is the gate ADR 0041 added; skipping it defeats the split. An unpushed target commit surfaces as an opaque `HTTP 500` from the releases API, not a helpful error.
- Titling the release with a name suffix (`"v0.1.0 - <name>"`). The title is the version string alone; any narrative goes in the notes body (and in `CHANGELOG.md`'s prose).
- Assuming unlabeled PRs are fine because "Other Changes" catches them. That catch-all exists for genuinely unlabeled/chore work, not as a substitute for checking - a `feat:`/`fix:`/`migration`/`config` PR that slipped through unlabeled belongs in a risk-flagged category of the generated notes, not buried at the bottom.
- Missing a migration because you only read PR titles. Check `git diff --name-only <last-tag>..main -- infra/migrations` directly.
- Bumping minor for every release out of habit. Most releases here are patches.
- Treating `package.json`'s version as the current version - the field doesn't exist there anymore; the git tag is the sole source of truth for what's deployed.
- Adding the new `## vX.Y.Z` heading below an older one, or deleting/rewriting a prior version's section - entries are additive and reverse-chronological; only a live `## Unreleased` section (if any) sits above the newest release.
