# 0060 - Publish Failed CI Test Reports To A Separate Pages Repo

## Status

Accepted

## Context

When `Automated tests` fails on a PR, the job log and summary show counts, not what broke, and the per-test errors, E2E failure screenshots and server output stay on the runner. Timing-dependent or CI-only failures can't be reproduced locally. Vitest's html report has to be served over HTTP, so a downloadable artifact alone is awkward to read.

## Decision

- **Hosting: a separate public repo, `antonbsa/twitch-radar-ci-reports`, served by GitHub Pages from `main` at `/`.** An orphan branch in this repo was rejected: `git fetch` pulls every `refs/heads/*`, so every clone, worktree and agent session would download the latest reports (screenshots, traces, logs) on each fetch. A separate repo is also disposable (delete and recreate it) and its credential can only touch reports.
- **Credential: an SSH deploy key with write access** on the reports repo, stored as the `CI_REPORTS_DEPLOY_KEY` secret here. It is scoped to one repo, doesn't expire and isn't tied to a user, unlike a PAT.
- **History: one orphan commit.** Each publish or cleanup rebuilds `main` as a single commit and force-pushes it, so the repo only holds the reports of open PRs. The push uses `--force-with-lease` against the `main` it started from and redoes the work on a changed `main`, so two PRs publishing at once both end up present. A `concurrency` group was rejected for this: GitHub keeps one pending run per group and cancels older pending ones, which would silently drop a report.
- **Contents per tier** (`pr-<n>/<run_id>/{api,e2e}/`, plus a generated `index.html`): the Vitest html report, the `wrangler dev`/`vite` output (streamed to a file by `spawnCapturing`'s `logFile`), and for E2E the failure screenshots and a Playwright trace per failed test, opened through `trace.playwright.dev`. Traces are recorded always but saved only for failed tests. Only the latest run per PR is kept.
- **Comments only on failure.** The `report` job in `tests.yaml` runs for same-repo PRs only (fork PRs get no secrets), upserts one comment marked `<!-- ci-test-reports -->`, deletes it when both tiers pass, and does nothing on cancelled runs. `ci-reports-cleanup.yaml` removes `pr-<n>/` when the PR closes.

## Consequences

- Passing runs upload nothing and keep no trace files.
- The reports are public: the published server logs must not contain secrets. CI only has `.env.development` placeholders; keep it that way.
- `main` of the reports repo is rewritten on every publish, so nothing there is permanent. PR screenshot uploads (`pr-assets` branch) are a different lifecycle and stay where they are.
- One-time setup is in [docs/deployment.md](../deployment.md#ci-test-reports-repo).
