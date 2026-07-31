---
name: preparing-a-release
description: Use when preparing a production release in this repo - picking the version, drafting release notes, or answering "what shipped since the last release" / "how do I deploy to production". Does not publish the release itself.
---

# Preparing a Release

## Overview

Publishing a GitHub release **is** the production deploy in this repo — [`deploy-release.yaml`](../../../.github/workflows/deploy-release.yaml) triggers on `release: published`, re-runs the full suite against the tag, applies pending D1 migrations against `twitch-radar-prod`, then deploys ([ADR 0041](../../../docs/decisions/0041-release-gated-production-deploys.md)). There is no other path to production. This skill prepares everything a release needs — version, risk call-outs, notes — and stops short of running `gh release create`. Publishing stays a deliberate human action, not something an agent does on request.

`.github/release.yml` already turns merged PR titles into a categorized list. Your job is the part it can't do: deciding the version, and surfacing what a reader needs to know that a list of PR titles doesn't say.

## When to use

Cutting a production deploy, drafting release notes, or picking the next version number. Not for preview deploys — those happen automatically on push to `main`, no release involved.

## What to do

1. **Find the baseline.** `git fetch --tags && git describe --tags --abbrev=0` for the last tag. If there are no tags yet, the first release is `v0.1.0` (ADR 0041 — SemVer with major pinned at 0 while the MVP is under development; `package.json`'s `"1.0.0"` is stale and not the source of truth).

2. **Gather the range.** `git log <last-tag>..main --no-merges --pretty="%h %s"` for the commits, and `gh pr list --state merged --base main --limit 50 --json number,title,labels,mergedAt` for the PRs. Read the commits, not just the PR titles — merge commits hide the Conventional Commit prefixes that tell you what kind of change each one is.

3. **Check the three things that make a release risky**, and name each one explicitly in the notes if present:
   - New files in `infra/migrations` — irreversible against production D1. Say which tables/columns change.
   - Changes to `apps/api/wrangler.jsonc`, `apps/api/src/crons.ts`, or the env schema in `apps/api/src/env.ts` — a new binding, cron, or required env var must be provisioned before the deploy, or the Worker breaks on boot.
   - Changes to `apps/web/public/sw.js` or the push/subscription contract — installed PWAs hold a cached service worker; a contract change can silently break notifications on devices already out there.

4. **Pick the version.** While major is pinned at 0: breaking change to a stored contract (push subscription shape, API response consumed by the deployed PWA) → minor bump. Everything else → patch bump. Say in one line why you chose it.

5. **Draft the notes** in this shape:
   - **Two to four sentences of prose at the top** — what changed for a user of the PWA, in product language. This is the part a PR-title list can never produce.
   - **Any deploy-affecting item from step 3**, called out before the generated list.
   - **The generated PR list** below it, untouched.

6. **Hand the command to the human — do not run it.** Publishing deploys to production. Print the exact command and let them execute it:

   ```sh
   gh release create v0.1.0 --target <sha> --title "v0.1.0 - <short name>" --generate-notes --notes-start-tag <last-tag>
   ```

   Then tell them to paste the prose from step 5 above the generated list in the release body (or use `--draft` and edit before publishing).

## Labels

`.github/release.yml` categorizes on labels. `bug`, `enhancement`, and `documentation` exist by default; `migration`, `config`, and `skip-changelog` do not. Create them once:

```sh
gh label create migration --color d93f0b --description "Touches infra/migrations - irreversible in prod"
gh label create config --color d93f0b --description "Touches wrangler.jsonc, crons, or env vars"
gh label create skip-changelog --color ededed --description "Omit from generated release notes"
```

Unlabeled PRs still appear, under "Other Changes" — the catch-all category exists so nothing is silently dropped.

## Common mistakes

- Running `gh release create` yourself. It ships to production; the human decides when.
- Publishing the generated list alone. Twelve PR titles is an audit trail, not release notes — the prose at the top is the reason this skill exists.
- Tagging a commit that isn't on `main`, or one whose preview deploy hasn't been exercised. Preview is the gate ADR 0041 added; skipping it defeats the split.
- Missing a migration because you only read PR titles. Check `git diff --name-only <last-tag>..main -- infra/migrations` directly.
- Bumping minor for every release out of habit. Most releases here are patches.
- Treating `package.json`'s version as the current version — it is not updated per release; the git tag is the source of truth.
