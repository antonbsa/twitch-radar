# infra

Conventions for `infra/` (D1 migrations, dev/deploy scripts).

## Migrations

- Generate migrations with `npm run migrations:create` (drizzle-kit); never hand-write a migration file.
- New migrations are named `<YYYYMMDDHHMMSS>_<name>.sql` (`--prefix timestamp`, [ADR 0059](../docs/decisions/0059-timestamp-prefixed-d1-migrations.md)); `0001`-`0014` keep their index names. Two parallel branches no longer collide on a number.
- `wrangler d1 migrations apply` tracks what's applied by **filename** in the `d1_migrations` table, not by content, so a migration keeps the name it was first generated with.
- Parallel branches still share a snapshot `prevId`: the second to merge fails `db:check` even with distinct filenames. To fix it, merge `main`, take `main`'s `meta/_journal.json`, delete your own `.sql`, its `meta/<prefix>_snapshot.json` and note the filename, then run `migrations:create` again on the merged baseline. Rename the new `.sql`, the new snapshot and the journal `tag` back to the noted prefix. That is the only way to keep the snapshot chain correct; never edit the journal beyond that `tag`.
- Two checks run in CI (`.github/workflows/code-quality.yaml`) and catch this collision: `npm run db:check -w @twitch-radar/api` (`drizzle-kit check`) walks the snapshot chain, and `npm run check-migrations` compares the `.sql` files with `meta/_journal.json` (orphan or missing files, shared numeric prefix). `drizzle-kit check` passes on a duplicate or orphan `.sql`, so both are needed. Run both after any rebase or merge that touched `infra/migrations`, and treat a failure as this problem, not a flaky check.

## Local D1 already recorded the old filename

If `npm run db:setup` fails after a migration was renamed (a legacy index-named one renumbered, or a timestamped one regenerated without restoring its name) (typically `duplicate column name: ... : SQLITE_ERROR`), read [docs/d1-migration-rename-recovery.md](../docs/d1-migration-rename-recovery.md) before touching local D1.
