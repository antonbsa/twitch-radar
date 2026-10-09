#!/usr/bin/env node
/**
 * Fails if `infra/migrations/*.sql` and `meta/_journal.json` disagree: a SQL
 * file with no journal entry (or the reverse), a missing snapshot, or two
 * files sharing a numeric prefix. `drizzle-kit check` only walks the snapshot
 * chain; wrangler applies whatever `.sql` files exist, by filename.
 *
 * Usage: node infra/scripts/check-migrations.mjs
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../..")
const MIGRATIONS_DIR = resolve(REPO_ROOT, "infra/migrations")

const journal = JSON.parse(
  readFileSync(resolve(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"),
)
const journalTags = new Set(journal.entries.map((entry) => entry.tag))
const sqlTags = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith(".sql"))
  .map((file) => file.slice(0, -".sql".length))

const errors = []

for (const tag of sqlTags) {
  if (!journalTags.has(tag)) {
    errors.push(`${tag}.sql has no entry in meta/_journal.json`)
  }
}

for (const tag of journalTags) {
  if (!sqlTags.includes(tag)) {
    errors.push(`journal entry "${tag}" has no ${tag}.sql`)
  }
  const prefix = tag.split("_")[0]
  if (!existsSync(resolve(MIGRATIONS_DIR, `meta/${prefix}_snapshot.json`))) {
    errors.push(`journal entry "${tag}" has no meta/${prefix}_snapshot.json`)
  }
}

const byPrefix = Map.groupBy(sqlTags, (tag) => tag.split("_")[0])
for (const [prefix, tags] of byPrefix) {
  if (tags.length > 1) {
    errors.push(`prefix ${prefix} is shared by ${tags.join(", ")}`)
  }
}

if (errors.length > 0) {
  console.error("Migration check failed:")
  for (const error of errors) console.error(`  - ${error}`)
  console.error(
    'See infra/AGENTS.md, "Migrations", for how to resolve a collision.',
  )
  process.exit(1)
}

console.log(`Migrations OK (${sqlTags.length} files, journal in sync).`)
