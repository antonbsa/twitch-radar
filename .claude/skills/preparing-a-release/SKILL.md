---
name: preparing-a-release
description: Prepare a production release: pick the version, write the CHANGELOG entries, and create the GitHub release as a draft. Never publishes it.
disable-model-invocation: true
---

# Preparing a Release

Publishing a GitHub release **is** the production deploy: [`deploy-release.yaml`](../../../.github/workflows/deploy-release.yaml) runs on `release: published`, re-tests the tag, applies pending D1 migrations, then deploys ([ADR 0041](../../../docs/decisions/0041-release-gated-production-deploys.md)). Not for preview deploys (automatic on push to `main`). This skill prepares the version, labels, risk call-outs and the `CHANGELOG*.md` entries, commits them to `main` once the human approves, and creates the release **as a draft**. Publishing stays a human action.

[`CHANGELOG.md`](../../../CHANGELOG.md) is the source of truth for the user-facing notes and the in-app "What's New" sheet ([ADR 0050](../../../docs/decisions/0050-changelog-as-source-of-truth-for-release-notes.md)); `CHANGELOG.pt-BR.md` and `CHANGELOG.es.md` are translated in lockstep. The release body is the English entry plus GitHub's label-generated list (`--notes` + `--generate-notes`). Your part is the version, the labels, and plain-language bullets a PWA user would understand. "What shipped since the last release" is answered in plain chat with `git log <last-tag>..main`.

## What to do

1. **Find the baseline.** `git fetch --tags && git describe --tags --abbrev=0` for the last tag. If there are no tags yet, the first release is `v0.1.0` (ADR 0041 - SemVer with major pinned at 0 while the MVP is under development; `package.json` has no `version` field - the git tag is the sole source of truth for what's deployed, `CHANGELOG.md`'s latest heading is the source of truth for what the in-app widget shows, and a release entry keeps the two in lockstep by construction).

2. **Gather the range.** `git log <last-tag>..main --no-merges --pretty="%h %s"` for the commits, and `gh pr list --state merged --base main --limit 50 --json number,title,labels,mergedAt` for the PRs. Read the commits, not just the PR titles - merge commits hide the Conventional Commit prefixes that tell you what kind of change each one is.

3. **Validate every PR in range has a label.** `.github/release.yml` categorizes purely on labels (see "Labels" below); an unlabeled PR silently lands in "Other Changes" instead of the functional category (Features/Fixes/Docs & Decisions) it belongs in. For every merged PR since the last tag with an empty `labels` array:
   - Read its changed files (`gh pr view <n> --json files`) and title/commit prefixes.
   - Apply `migration` if it touches `infra/migrations`, `config` if it touches `apps/api/wrangler.jsonc` / `apps/api/src/crons.ts` / `apps/api/src/env.ts`, plus the applicable default (`bug` for `fix:`, `enhancement` for `feat:`, `documentation` for `docs:`) - same rule as `creating-pull-requests`. `migration`/`config` don't have their own category in `release.yml` (see "Labels" below) - they still describe risk, surfaced in step 4 and the notes' prose, not in how the PR is grouped.
   - `chore:`/`refactor:`/`test:`-prefixed PRs that touch none of the risk paths above have no correct default label - leave them unlabeled (they correctly fall into "Other Changes", which exists precisely so unlabeled work isn't dropped, not miscategorized into something it isn't).
   - Present the suggested labels to the human before applying (`gh pr edit <n> --add-label "..."`) - this rewrites shared PR metadata, not local draft state.

4. **Check the three things that make a release risky**, and name each one explicitly in a short "Deploy notes" paragraph for the GitHub Release body if present (step 10) - not in `CHANGELOG.md`, whose readers are users, not operators:
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
   - Draft this entry in English regardless of the conversation's language, matching every other artifact in this repo.
   - New heading: `## vX.Y.Z — <publish date, YYYY-MM-DD>`, inserted above the previous top entry (below any `## Unreleased` section, which this skill doesn't manage or remove).

7. **Translate the approved entry into `CHANGELOG.pt-BR.md` and `CHANGELOG.es.md` and show those too, before writing anything.** Same heading (`## vX.Y.Z — <date>` - version and date are never translated), same section structure, `### New`/`### Improved`/`### Fixed` headings left in English in every file (the build-time parser matches on them literally - see `changelog-parser.ts`'s `SECTION_TITLES`). Translate the prose using the terminology the UI itself uses in that language (check `apps/web/public/locales/<lang>.json` for how a feature is already named - e.g. "Notificarme"/"Notificar-me" for the notify-category action, "Recordarme"/"Lembrar" for the snooze reminder) rather than translating literally from the English draft.

8. **Once the human approves all three entries, commit them to `main` together and push - this must land before tagging.**

   ```sh
   git add CHANGELOG.md CHANGELOG.pt-BR.md CHANGELOG.es.md
   git commit -m "docs: add CHANGELOG entry for vX.Y.Z"
   git push origin main
   ```

   This is the first artifact of the release, not a byproduct of it (ADR 0050) - the tag and the GitHub Release both point at the commit that adds this entry. The GitHub Release body itself (step 10) is built from the English file only - the translated siblings exist for the in-app widget, not for GitHub.

9. **Confirm the target commit is on the remote.** `git rev-parse HEAD` vs `git rev-parse origin/main` (after `git fetch origin`) - the push in step 8 should already cover this, but re-check before tagging. If `main` is still ahead of `origin/main` for any reason, `gh release create` will fail against an unpushed SHA (observed as a bare `HTTP 500` with no useful message, not a clean validation error).

10. **Create the release as a draft - body is the committed `CHANGELOG.md` entry (plus deploy notes from step 4, if any), with GitHub's generated PR list appended; title is the version string alone (`v0.1.0`, not `v0.1.0 - <name>`):**

   ```sh
   gh release create v0.1.0 --target <sha> --title "v0.1.0" --draft --generate-notes \
     --notes "<the vX.Y.Z section body from CHANGELOG.md, heading stripped>

   <deploy notes, if any>"
   ```

   `--generate-notes` produces the categorized "What's Changed" list from PR labels, and `--notes` is prepended above it - the user-facing entry on top, the engineering list below, neither copied into the other.

11. **Return the draft's URL and stop.** That's the artifact for human review and manual publish (UI button, or `gh release edit <version> --draft=false`) - never call `--draft=false` or otherwise flip it to published yourself.

## Labels

`.github/release.yml` categorizes on labels. Check they exist with `gh label list`, and create any that are missing:

```sh
gh label create migration --color d93f0b --description "Touches infra/migrations - irreversible in prod"
gh label create config --color d93f0b --description "Touches wrangler.jsonc, crons, or env vars"
gh label create skip-changelog --color ededed --description "Omit from generated release notes"
```

`migration` and `config` deliberately have no category of their own: a PR carrying one still groups under its functional label (Features/Fixes/Docs & Decisions). They exist so step 4 and anyone auditing later can find what touched migrations/config; `creating-pull-requests` owns applying them at PR open. Unlabeled PRs land in "Other Changes" so nothing is dropped.

## Common mistakes

- Flipping the draft to published (`--draft=false`): that ships to production and stays with the human.
- Tagging before the CHANGELOG entry is committed and pushed to `main`: an unpushed target SHA surfaces as an opaque `HTTP 500` from the releases API.
- Copying PR titles or numbers into `CHANGELOG.md`: that list comes from `--generate-notes`; the file is plain user-facing language.
- Passing only one of `--notes` / `--generate-notes`: the body needs both halves.
- Committing `CHANGELOG.md` without its `pt-BR`/`es` translations (ADR 0050).
- Titling the release with a name suffix: the title is the version string alone.
- Treating "Other Changes" as a substitute for labeling a `feat:`/`fix:`/`migration`/`config` PR.
- Detecting migrations from PR titles: check `git diff --name-only <last-tag>..main -- infra/migrations`.
- Bumping minor out of habit (most releases are patches), or reading a version from `package.json` (it has none; the git tag is the source of truth).
- Inserting the new `## vX.Y.Z` heading below an older one or rewriting a prior section: entries are additive and reverse-chronological, below any `## Unreleased`.
