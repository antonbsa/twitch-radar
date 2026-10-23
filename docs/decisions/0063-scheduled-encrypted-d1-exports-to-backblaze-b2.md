---
status: Accepted
area: operations
---

# 0063 - Scheduled Encrypted D1 Exports To Backblaze B2

## Status

Accepted

## Context

D1 holds everything that can't be rebuilt: users, encrypted Twitch tokens, push subscriptions, follows, preferences and delivery history. Backups were manual commands in `docs/operations/backup-and-restore.md`: nothing ran on a schedule, no copy lived outside Cloudflare, and no restore had been rehearsed. D1 Time Travel doesn't survive deleting the database or losing the Cloudflare account. A restored dump is also only usable with the original `TOKEN_ENCRYPTION_KEY` and VAPID keypair, and Cloudflare never returns secrets once set.

## Decision

Recovery objectives:

- A logical error (bad migration or write) recovers to the minute through Time Travel, in under 15 minutes.
- Losing the database or the account recovers to at most 24 hours back, from an off-site export.
- `preview` is not backed up. KV and queues are disposable and out of scope.

Mechanism:

- **Bookmark before migrations.** `deploy-release.yaml` writes the Time Travel bookmark to the job summary before applying migrations, so undoing a migration is `restore --bookmark=<x>`.
- **Daily export.** A scheduled workflow runs `wrangler d1 export` against production, imports the dump into a local D1 and fails if `users` or `d1_migrations` is empty, encrypts it with `age` (public key in the repo, private key kept offline) and uploads it to a dedicated Backblaze B2 bucket through its S3-compatible API. The application key is limited to that bucket and lives only as a GitHub Actions secret. A lifecycle rule keeps 30 days. A failed step fails the run, and GitHub's workflow-failure email is the notification.
- **Cost guard.** B2's free tier (10 GB) is far above the roughly 1 MB compressed dump. The smallest daily caps for storage and Class A/B/C transactions are set so an overrun returns `403 cap_exceeded` instead of billing.
- **Secrets inventory.** `TOKEN_ENCRYPTION_KEY`, the production VAPID keypair and the `age` private key are stored in a password manager when generated. Losing the VAPID keypair invalidates every restored push subscription; losing `TOKEN_ENCRYPTION_KEY` sends every user to the reconnect state.
- **Rehearsal.** A restore of the latest dump into `preview` is repeated every few months, following the runbook.

## Consequences

- The export locks the database while it runs (seconds at about 5 MB), so it is scheduled off-peak; revisit when the dump grows.
- Accepted risks: up to 24 hours of data loss if the database and account are lost; the dump holds encrypted tokens and push endpoints, protected by `age` and by the bucket-scoped key; a stolen `age` private key plus bucket access exposes them.
- Alternatives not taken: Cloudflare R2 (same account as the database, so it doesn't survive losing the account); unencrypted dumps.
- The GitHub secrets `B2_KEY_ID` and `B2_APPLICATION_KEY` and the variables `B2_BUCKET`, `B2_ENDPOINT` and `B2_REGION` must be set for the workflow to pass.
