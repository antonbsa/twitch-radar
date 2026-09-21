# 0049 - CHANGELOG.md As The Source Of Truth For Release Notes

## Status

Accepted

## Context

Issue #63 wants an in-app "What's New" widget: a version badge on the account page and a sheet listing what changed in the last few releases. ADR 0041 already makes publishing a GitHub release the production deploy trigger, and `.github/release.yml` turns merged PR titles into a categorized "What's Changed" body via `gh release create --generate-notes` (or the `preparing-a-release` skill's hand-assembled `--notes`). That body only exists on GitHub — nothing in the repo captures it, and the repo is private with no GitHub API integration wired into the app, so the widget has nothing to read at build or runtime.

Two ways to give the widget something to read were considered:

1. **Call the GitHub Releases API at runtime or build time.** Requires a token with repo read access reachable from the Cloudflare Worker or the CI build, plus network access during `vite build` (or a runtime fetch from the PWA, which the issue explicitly rules out for a private repo with no such integration today). Adds a new external dependency to every build and couples the widget's availability to GitHub's API uptime.
2. **Author a root-level `CHANGELOG.md` by hand as part of release prep, and generate the GitHub Release body from it instead of the other way around.** The file is already in the repo the build reads from; a build-time parser needs no network access and no credentials.

Option 2 inverts today's direction (GitHub-generated notes as the only artifact) but removes the runtime dependency entirely, and gives the widget real content the moment the build runs.

## Decision

`CHANGELOG.md`, at the repo root, is the source of truth for release notes. It is authored and committed to `main` by hand during release prep — the first artifact produced, before tagging — and the GitHub Release body is generated _from_ it, not the other way around. This reverses the direction ADR 0041 assumed (GitHub's "Generate release notes" turning PR labels into the only record); `preparing-a-release` is updated accordingly (see its `SKILL.md`).

**Structure.** One `##` section per version, in reverse-chronological order, heading format `## v0.1.1 — 2026-08-30` (version + publish date). Within each version, content is grouped under the same five categories `.github/release.yml` already uses, in the same order (`Migrations & Config` / `Features` / `Fixes` / `Docs & Decisions` / `Other Changes`) — one categorization scheme for both the file and the generated GitHub notes, so a contributor doesn't have to learn two. An optional `## Unreleased` section may exist for in-progress notes; it is ignored by both the build-time parser and the version badge, which only ever reflects the latest _published_ version.

**The web build parses it, not a committed artifact.** `apps/web` reads the root `CHANGELOG.md` at build time through a local Vite plugin exposing it as a virtual module, rather than a prebuild script writing a generated JSON file into the repo. This keeps the parsed data always in sync with the file a human just edited, with nothing generated to fall out of date or need `.gitignore`-ing.

**No runtime API calls, no version field.** The widget never calls the GitHub API. ADR 0041's decision that the git tag is the sole source of truth for the running version is unchanged — the version shown in-app is read from `CHANGELOG.md`'s latest heading (which a human enters to match the tag being cut), not from a `package.json` field or a runtime lookup.

## Consequences

- Release prep gains a manual writing step: the person cutting a release authors the `CHANGELOG.md` entry (in the five categories) and commits it to `main` before tagging, instead of only running `gh release create --generate-notes` after the fact. `preparing-a-release`'s workflow reflects this ordering.
- The GitHub Release body is generated from the committed changelog entry, so the two never drift — there is exactly one authored account of what shipped, not two ad hoc ones.
- The widget only ever shows what a human deliberately wrote into the file. A release cut without updating `CHANGELOG.md` first has no user-facing "What's New" entry beyond the version number itself (the version badge always reflects the last released version; a version with nothing in Features/Fixes shows a placeholder instead of being hidden).
- A future non-web consumer of release notes (were one ever needed) reads the same file instead of scraping GitHub, but nothing in this repo currently needs that beyond `apps/web`.
