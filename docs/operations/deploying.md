# Deploying

Two independent pipelines; why they are decoupled is in [deploy and release](../architecture/deploy-and-release.md) ([ADR 0041](../decisions/0041-release-gated-production-deploys.md)). First-time setup of an environment is in [environment setup](environment-setup.md); a deploy that misbehaves is stopped from the [incident page](incident.md).

- **Preview** — every push to `main` deploys automatically via [`.github/workflows/deploy-preview.yaml`](../../.github/workflows/deploy-preview.yaml): the [Code quality](../../.github/workflows/code-quality.yaml) and [Automated tests](../../.github/workflows/tests.yaml) workflows run first (skipped if the push came from merging a PR, since those already ran against the `pull_request` event), then pending D1 migrations are applied against `twitch-radar-preview` and `npm run deploy:preview` runs.
- **Production** — publishing a [GitHub release](https://github.com/antonbsa/twitch-radar/releases/new) deploys via [`.github/workflows/deploy-release.yaml`](../../.github/workflows/deploy-release.yaml). The workflow checks out the release's tag, re-runs the Code quality and Automated tests workflows against that exact commit, then applies pending D1 migrations against `twitch-radar-prod` and runs `npm run deploy`. To cut one: pick the `main` commit to ship, create a tag (e.g. `v0.1.1`) and publish a release against it from the GitHub UI, using "Generate release notes" for the changelog — its categories come from [`.github/release.yml`](../../.github/release.yml). The full checklist for cutting a release (version choice, migration/config/service-worker call-outs, notes structure) is in [release](../../.claude/skills/release).

## Deploying Manually

To deploy manually instead (e.g. to test a change before merging):

```sh
npm run deploy           # builds apps/web, then `wrangler deploy --env production` from apps/api
npm run deploy:preview   # same, but `wrangler deploy --env preview`
```

If you added a new D1 migration, apply it first (not part of either `deploy` script):

```sh
cd apps/api && npx wrangler d1 migrations apply twitch-radar-prod --remote --env production
# or, for preview:
cd apps/api && npx wrangler d1 migrations apply twitch-radar-preview --remote --env preview
```
