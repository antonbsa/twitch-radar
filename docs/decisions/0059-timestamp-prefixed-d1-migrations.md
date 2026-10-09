# 0059 - Timestamp-Prefixed D1 Migrations

## Status

Accepted

## Context

[ADR 0015](0015-generate-d1-migrations-with-drizzle-kit.md) generates migrations with `drizzle-kit generate --prefix index`, so the next number is "the highest on this branch plus one". Worktrees branch in parallel, so two branches regularly generate the same number, and the second to merge hits three separate problems:

1. **Filename collision.** Both land `0012_*.sql`; the journal entry (`idx`, `tag`) conflicts textually in `meta/_journal.json`.
2. **Snapshot-chain collision.** Each branch's snapshot has the same `prevId`. `drizzle-kit check` fails ("pointing to a parent snapshot ... which is a collision"), and a snapshot that lacks the other branch's columns makes the next `generate` diff wrongly. This is why `infra/AGENTS.md` says to regenerate on the merged baseline instead of renumbering by hand.
3. **Local D1 remembers the old filename.** `wrangler d1 migrations apply` tracks applied migrations by filename in `d1_migrations`. A renumbered migration the worktree had already applied re-runs under its new name and fails with `duplicate column name` (recovery: [infra/AGENTS.md](../../infra/AGENTS.md), "Local D1 already recorded the old filename").

Checked with drizzle-kit 0.31: `--prefix timestamp` names the files `YYYYMMDDHHMMSS_<name>.sql` (UTC), the snapshot `YYYYMMDDHHMMSS_snapshot.json`, and the journal `tag` the same, with `idx` still sequential. `drizzle-kit check` accepts the mix of `0001`-`0014` and timestamped entries. Wrangler sorts migration files lexicographically, and every `00NN_` name sorts before any `20…` timestamp, so the existing history keeps its order.

## Decision

- **New migrations use `--prefix timestamp`.** `apps/api/package.json` `migrations:create` changes from `--prefix index` to `--prefix timestamp`. Existing `0001`-`0014` files are not renamed (renaming would trigger problem 3 in every environment).
- **A migration keeps the filename it was first generated with.** After merging `main`, a branch whose snapshot chain collides regenerates the migration on the merged baseline and then restores the original filename in the `.sql`, the snapshot and the journal `tag`. The SQL content is independent of other branches unless both touch the same column, so the restored name keeps local D1 and any preview that already applied it consistent. Problem 3 only occurs if the content really changed, which `infra/AGENTS.md` already covers.
- **`npm run check-migrations` stays the guard** for `.sql`/journal/snapshot consistency; it reads the prefix up to the first `_`, so it works with both schemes.

## Consequences

- Problem 1 disappears (names cannot collide) and the journal conflict shrinks to two entries appended at the same place, resolved by keeping both.
- Problem 2 does not disappear: parallel branches still share a `prevId`, so the branch that merges second still regenerates its snapshot. The timestamp only makes it possible to keep the migration's filename while doing so.
- Filenames lose the at-a-glance ordinal; ordering comes from the timestamp and the journal `idx`.
- The restore-the-name step is manual. If it proves error-prone, a `migrations:rebase` script is the follow-up, not part of this decision.
- `infra/AGENTS.md` (including its local D1 recovery section) and ADR 0015 are updated when this is accepted.
