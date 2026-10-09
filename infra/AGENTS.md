# infra

Conventions for `infra/` (D1 migrations, dev/deploy scripts).

## Migrations

- Generate migrations with `npm run migrations:create` (drizzle-kit); never hand-write a migration file.
- `wrangler d1 migrations apply` tracks what's applied by **filename** in the `d1_migrations` table, not by content. Two branches that each generate `0006_*.sql` can't both keep that number once both land on `main`.
- Only one branch should generate a migration at a time. If yours collides with one that landed on `main` first: rebase onto `main`, delete your own `.sql` file and its `meta/<n>_snapshot.json`, and run `migrations:create` again on the merged baseline. That is the only way to keep the snapshot chain correct; don't hand-renumber the file or edit the journal.
- Two checks run in CI (`.github/workflows/code-quality.yaml`) and catch this collision: `npm run db:check -w @twitch-radar/api` (`drizzle-kit check`) walks the snapshot chain, and `npm run check-migrations` compares the `.sql` files with `meta/_journal.json` (orphan or missing files, shared numeric prefix). `drizzle-kit check` passes on a duplicate or orphan `.sql`, so both are needed. Run both after any rebase or merge that touched `infra/migrations`, and treat a failure as this problem, not a flaky check.

## Local D1 already recorded the old filename

If `npm run db:setup` fails after renumbering a migration (typically `duplicate column name: ... : SQLITE_ERROR`), read [docs/d1-migration-rename-recovery.md](../docs/d1-migration-rename-recovery.md) before touching local D1.
