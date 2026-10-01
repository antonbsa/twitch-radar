# Recovering local D1 after a migration rename

If a migration was renumbered after a collision (see [infra/AGENTS.md](../infra/AGENTS.md), "Migrations") but your local D1 had already applied it under the old filename, `db:setup` re-runs the migration under its new name and fails (typically `duplicate column name: ... : SQLITE_ERROR`). Repoint the tracking row at the new filename without losing dev data. This is a mutating `d1 execute`, so confirm before running it (see [apps/api/AGENTS.md](../apps/api/AGENTS.md), "D1 debug queries"):

```bash
cd apps/api
npx wrangler d1 execute twitch-radar-dev --local \
  --command "UPDATE d1_migrations SET name = '<new_filename>.sql' WHERE name = '<old_filename>.sql'"
```

Then `npm run db:setup` should report "No migrations to apply!" (or apply only the genuinely new ones). Deleting `apps/api/.wrangler/state/v3/d1` and rerunning `npm run db:setup` also works, but wipes local sessions and synced channel data.
