---
name: preparing-a-release
description: Use when preparing a production release in this repo - picking the version, drafting release notes, or answering "what shipped since the last release" / "how do I deploy to production". Creates the release as a draft; never publishes it.
---

# Preparing a Release

## Overview

Publishing a GitHub release **is** the production deploy in this repo - [`deploy-release.yaml`](../../../.github/workflows/deploy-release.yaml) triggers on `release: published`, re-runs the full suite against the tag, applies pending D1 migrations against `twitch-radar-prod`, then deploys ([ADR 0041](../../../docs/decisions/0041-release-gated-production-deploys.md)). There is no other path to production. This skill prepares everything a release needs - version, labels, risk call-outs, notes - and, once the human accepts the drafted prose, creates the release itself **as a draft**. Publishing (flipping draft → published) stays a deliberate human action this skill never takes.

`.github/release.yml` already turns merged PR titles into a categorized list. Your job is the part it can't do: deciding the version, and surfacing what a reader needs to know that a list of PR titles doesn't say.

## When to use

Cutting a production deploy, drafting release notes, or picking the next version number. Not for preview deploys - those happen automatically on push to `main`, no release involved.

## What to do

1. **Find the baseline.** `git fetch --tags && git describe --tags --abbrev=0` for the last tag. If there are no tags yet, the first release is `v0.1.0` (ADR 0041 - SemVer with major pinned at 0 while the MVP is under development; `package.json` has no `version` field - the git tag is the sole source of truth).

2. **Confirm the target commit is on the remote.** `git rev-parse HEAD` vs `git rev-parse origin/main` (after `git fetch origin`). If `main` is ahead of `origin/main`, the commits you'd tag don't exist on GitHub yet - `gh release create` will fail against an unpushed SHA (observed as a bare `HTTP 500` with no useful message, not a clean validation error). Push first, or ask the human to.

3. **Gather the range.** `git log <last-tag>..main --no-merges --pretty="%h %s"` for the commits, and `gh pr list --state merged --base main --limit 50 --json number,title,labels,mergedAt` for the PRs. Read the commits, not just the PR titles - merge commits hide the Conventional Commit prefixes that tell you what kind of change each one is.

4. **Validate every PR in range has a label.** `.github/release.yml` categorizes purely on labels (see "Labels" below); an unlabeled PR silently lands in "Other Changes" instead of the risk-flagged category it belongs in. For every merged PR since the last tag with an empty `labels` array:
   - Read its changed files (`gh pr view <n> --json files`) and title/commit prefixes.
   - Apply `migration` if it touches `infra/migrations`, `config` if it touches `apps/api/wrangler.jsonc` / `apps/api/src/crons.ts` / `apps/api/src/env.ts`, plus the applicable default (`bug` for `fix:`, `enhancement` for `feat:`, `documentation` for `docs:`) - same rule as `CLAUDE.md`'s PR-opening step.
   - `chore:`/`refactor:`/`test:`-prefixed PRs that touch none of the risk paths above have no correct default label - leave them unlabeled (they correctly fall into "Other Changes", which exists precisely so unlabeled work isn't dropped, not miscategorized into something it isn't).
   - Present the suggested labels to the human before applying (`gh pr edit <n> --add-label "..."`) - this rewrites shared PR metadata, not local draft state.

5. **Check the three things that make a release risky**, and name each one explicitly in the notes if present:
   - New files in `infra/migrations` - irreversible against production D1. Say which tables/columns change.
   - Changes to `apps/api/wrangler.jsonc`, `apps/api/src/crons.ts`, or the env schema in `apps/api/src/env.ts` - a new binding, cron, or required env var must be provisioned before the deploy, or the Worker breaks on boot.
   - Changes to `apps/web/public/service-worker.js` or the push/subscription contract - installed PWAs hold a cached service worker; a contract change can silently break notifications on devices already out there. Doesn't apply to the very first release (no devices out there yet).

6. **Pick the version.** While major is pinned at 0: breaking change to a stored contract (push subscription shape, API response consumed by the deployed PWA) → minor bump. Everything else → patch bump. Say in one line why you chose it.

7. **Draft the notes and show them to the human before creating anything.** Shape:
   - **Two to four sentences of prose at the top, in English** - what changed for a user of the PWA, in product language. This is the part a PR-title list can never produce. English regardless of the conversation's language, matching every other user-facing artifact in this repo (commits, ADRs, PR titles, code).
   - **Any deploy-affecting item from step 5**, called out before the generated list.
   - **The generated PR list** below it, untouched (fetch it with `gh api repos/<owner>/<repo>/releases/generate-notes -f tag_name=<version>` - or generate the real draft first and read its body back - rather than hand-assembling it, so categorization exactly matches what GitHub will actually render).

8. **Once the human accepts the prose, create the release as a draft - title is the version string alone (`v0.1.0`, not `v0.1.0 - <name>`):**

   ```sh
   gh release create v0.1.0 --target <sha> --title "v0.1.0" --draft \
     --notes "<prose from step 7>\n\n<generated notes body>"
   ```

   Omit `--notes-start-tag` on the first release (no prior tag to diff from). Never pass `--generate-notes` together with hand-assembled prose in the same call - write the full merged body via `--notes` instead, or the generated section will overwrite what you pass.

9. **Return the draft's URL and stop.** That's the artifact for human review and manual publish (UI button, or `gh release edit <version> --draft=false`) - never call `--draft=false` or otherwise flip it to published yourself.

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
- Publishing the generated list alone. Twelve PR titles is an audit trail, not release notes - the prose at the top is the reason this skill exists.
- Creating the draft before the human has approved the prose. Show the draft notes first; only step 8 touches `gh release create`.
- Tagging a commit that isn't on `main`, isn't pushed to `origin/main` yet, or whose preview deploy hasn't been exercised. Preview is the gate ADR 0041 added; skipping it defeats the split. An unpushed target commit surfaces as an opaque `HTTP 500` from the releases API, not a helpful error.
- Titling the release with a name suffix (`"v0.1.0 - <name>"`). The title is the version string alone; any narrative goes in the notes body.
- Assuming unlabeled PRs are fine because "Other Changes" catches them. That catch-all exists for genuinely unlabeled/chore work, not as a substitute for checking - a `feat:`/`fix:`/`migration`/`config` PR that slipped through unlabeled belongs in a risk-flagged category, not buried at the bottom.
- Missing a migration because you only read PR titles. Check `git diff --name-only <last-tag>..main -- infra/migrations` directly.
- Bumping minor for every release out of habit. Most releases here are patches.
- Treating `package.json`'s version as the current version - the field doesn't exist there anymore; the git tag is the sole source of truth.
