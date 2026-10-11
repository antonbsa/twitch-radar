# 0061 - Concurrency Rules For CI And Deploy Workflows

## Status

Accepted

## Context

No workflow declared `concurrency`, so every push started a full run and superseded runs kept going: wasted runner minutes on PRs, and two deploys to the same Cloudflare environment could overlap and finish out of order, leaving an older build live.

`tests.yaml` and `code-quality.yaml` also run as `workflow_call` from the deploy workflows, where `github.workflow` is the caller's name and `github.ref` the caller's ref.

## Decision

- **`tests.yaml` and `code-quality.yaml`: cancel superseded PR runs only.** Group `<workflow>-<head_ref>` with `cancel-in-progress` for `pull_request`; every other event (push to `main`, called by a deploy) uses `<workflow>-<sha>`, so each commit's run is unique and never cancelled. The group names are literal rather than `github.workflow`, so a called run cannot collide with its caller's group.
- **Deploy jobs queue.** `deploy-preview` and `deploy-production` are job-level groups with `cancel-in-progress: false`, set on the `deploy` job only so the check jobs still run in parallel. A running deploy finishes; GitHub keeps one pending deploy per group and replaces older pending ones, which is wanted here because only the newest build matters.

## Consequences

- Rapid pushes to a PR leave one live run.
- Deploys cannot overlap. Order follows when each deploy job becomes ready (after its checks), not commit order, so a slow older run can still deploy after a newer one; a strict guard would need a commit-ancestry check in the job.
- Two releases published while a production deploy runs: only the latest pending one deploys.
- [ADR 0060](0060-publish-failed-ci-test-reports-to-a-pages-repo.md) rejects `concurrency` for the report publishing workflow because dropping a pending run would lose a report; that does not apply here.
