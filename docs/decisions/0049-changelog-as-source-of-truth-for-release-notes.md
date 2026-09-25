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

`CHANGELOG.md`, at the repo root, is the source of truth for the **user-facing** part of release notes. It is authored and committed to `main` during release prep — the first artifact produced, before tagging. The GitHub Release body is that entry followed by GitHub's PR-label-generated "What's Changed" list (`gh release create --notes <entry> --generate-notes`, which prepends `--notes` to the generated list). This reverses the direction ADR 0041 assumed (GitHub's generated notes as the only record); `preparing-a-release` is updated accordingly (see its `SKILL.md`).

**Audience split, no duplication.** The file is written for people using the PWA, not for engineers: plain-language bullets describing what changed from the user's point of view, with no PR numbers, links, commit prefixes, or internal-only changes (docs, CI, refactors, dev tooling). The engineering account — every merged PR, sorted into `.github/release.yml`'s five label-driven categories — only exists in the GitHub Release body, where it is generated rather than authored. Copying the PR list into the file would make the in-app sheet read like a commit log and give the same content two places to drift.

**Structure.** One `##` section per version, in reverse-chronological order, heading format `## v0.1.1 — 2026-08-30` (version + publish date). An optional one-to-two sentence summary may follow the heading. Items are grouped under up to three `###` sections, in this order: `New` (something a user can do that they couldn't before), `Improved` (an existing thing works better), `Fixed` (something that was broken now works). A version with nothing a user would notice has no sections, and the widget shows a placeholder for it. An optional `## Unreleased` section may exist for in-progress notes; it is ignored by both the build-time parser and the version badge, which only ever reflects the latest _published_ version.

**The web build parses it, not a committed artifact.** `apps/web` reads the root `CHANGELOG.md` at build time through a local Vite plugin exposing it as a virtual module, rather than a prebuild script writing a generated JSON file into the repo. This keeps the parsed data always in sync with the file a human just edited, with nothing generated to fall out of date or need `.gitignore`-ing.

**No runtime API calls, no version field.** The widget never calls the GitHub API. ADR 0041's decision that the git tag is the sole source of truth for the running version is unchanged — the version shown in-app is read from `CHANGELOG.md`'s latest heading (which a human enters to match the tag being cut), not from a `package.json` field or a runtime lookup.

**English only.** Entries are written in English like every other project artifact; the widget localizes its own chrome (title, section labels, dates) but not entry text.

## Consequences

- Release prep gains a writing step: translating the merged PRs into a few user-facing bullets. `preparing-a-release` drafts that entry from the PR range and shows it for approval before committing it to `main` and tagging.
- Label hygiene still matters: the generated half of the GitHub Release body categorizes purely on PR labels, exactly as before.
- The widget only ever shows what a human deliberately wrote into the file. A release cut without updating `CHANGELOG.md` first has no "What's New" entry beyond the version number itself (the version badge always reflects the last released version).
- A future non-web consumer of user-facing release notes reads the same file instead of scraping GitHub, but nothing in this repo currently needs that beyond `apps/web`.
