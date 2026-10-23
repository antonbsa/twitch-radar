# Backup And Restore

What is lost depends on what is restored. D1 holds everything that can't be rebuilt: users, encrypted Twitch tokens, push subscriptions, follows, preferences and delivery history. KV holds only disposable state (sessions, OAuth state, the app token), and Twitch-side EventSub subscriptions are repaired by reconciliation within 30 minutes ([architecture overview](../architecture/overview.md#recovery)).

## Restore To A Point In Time

For a bad migration or a bad write. D1 Time Travel keeps a point-in-time history of each database (30 days on the paid plan, 7 on the free plan). Run from `apps/api`:

```sh
npx wrangler d1 time-travel info twitch-radar-prod --env production
npx wrangler d1 time-travel restore twitch-radar-prod --env production --timestamp=<ISO-8601 or unix>
```

The restore rewrites the database in place and prints the bookmark from just before it; restoring to that bookmark undoes the restore. Everything written after the chosen time is lost, including delivery rows for pushes that already went out, so the cooldown (ADR 0056) may let a repeat notification through in the window afterwards.

Every release run prints the Time Travel bookmark from just before the migrations in its job summary; undoing a bad migration is `npx wrangler d1 time-travel restore twitch-radar-prod --env production --bookmark=<bookmark>`.

## Off-Site Copy

Time Travel doesn't survive deleting the database or losing the account, so `.github/workflows/backup-d1.yaml` exports production every day at 03:17 UTC ([ADR 0063](../decisions/0063-scheduled-encrypted-d1-exports-to-backblaze-b2.md)). It moves the `INSERT` statements after the schema (wrangler writes tables alphabetically, so a child table would otherwise get rows before its parent exists), imports the dump into a local D1, fails if `users` or `d1_migrations` is empty, encrypts it with `age` to the public key in `infra/backups/age-recipient.txt`, and uploads `twitch-radar-prod-<timestamp>.sql.age` to a Backblaze B2 bucket. A failed run emails through GitHub's workflow-failure notification. `preview` is not backed up. The dump holds encrypted tokens and push endpoints; never commit a decrypted one.

The secrets a dump needs to be usable are kept outside Cloudflare: see [secrets](secrets.md#secrets-outside-cloudflare).

### One-Time Backup Setup

1. Generate the `age` keypair with `age-keygen -o age-key.txt`. Put the public key (the `age1...` line) in `infra/backups/age-recipient.txt` and store the whole file in the password manager; delete the local copy.
2. In Backblaze B2, create a private bucket and a lifecycle rule that keeps only the last version for 30 days. Create an application key limited to that bucket.
3. Set the smallest daily caps the console accepts for storage and Class A, B and C transactions. Confirm a cap blocks: an upload with the `X-Bz-Test-Mode: force_cap_exceeded` header must return `403 cap_exceeded`.
4. In GitHub, set the secrets `B2_KEY_ID` and `B2_APPLICATION_KEY` and the variables `B2_BUCKET`, `B2_ENDPOINT` (for example `https://s3.us-west-004.backblazeb2.com`) and `B2_REGION` (for example `us-west-004`).
5. Run the workflow once from the Actions tab (`workflow_dispatch`) and check the object appears in the bucket.

## Restore From An Off-Site Dump

1. Download the latest object from the bucket and decrypt it: `age --decrypt --identity age-key.txt --output dump.sql twitch-radar-prod-<timestamp>.sql.age`.
2. Create a database as in "One-Time Cloudflare Setup" ([environment setup](environment-setup.md#one-time-cloudflare-setup)) (or empty the target one), point the environment's `database_id` at it, and run `npx wrangler d1 execute <db> --remote --env <env> --file=dump.sql` from `apps/api`.
3. Set `TOKEN_ENCRYPTION_KEY` and the VAPID keypair back to the stored values, then follow "After A Restore Or A Rebuild".

Rehearse this every few months by restoring the latest dump into `preview` (`twitch-radar-preview`), and note the date and result in the PR that changes the process.

## After A Restore Or A Rebuild

1. Wait for (or watch) the 30-minute reconciliation: it recreates missing EventSub subscriptions and deletes ones the database no longer knows ([monitoring](../architecture/monitoring.md)).
2. If the database came back empty, users sign in again and re-create their alerts; nothing else restores them. Sessions for ids that no longer exist fail authorization and send the person to the login screen.
3. If `TOKEN_ENCRYPTION_KEY` changed, restored tokens can't be decrypted: every user lands in the reconnect state and signs in again.
4. If the VAPID keypair changed, every restored push subscription is silently invalid: every user re-enables push.
