// Parses the root CHANGELOG.md (ADR 0049) into structured data for the
// in-app "What's New" widget. Pure and dependency-free so it's unit
// testable without the Vite plugin (vite-plugins/changelog-plugin.ts) that
// wraps it for the `virtual:changelog` module.

export type ChangelogCategory =
  "migrations" | "features" | "fixes" | "docs" | "other"

export interface ChangelogVersion {
  version: string
  date: string
  categories: Record<ChangelogCategory, string[]>
}

const VERSION_HEADING = /^##\s+(v\S+)\s+[—-]\s+(\d{4}-\d{2}-\d{2})\s*$/
const CATEGORY_HEADING = /^###\s+(.+?)\s*$/
const LIST_ITEM = /^[-*]\s+(.+)$/

// Same five categories .github/release.yml generates GitHub Release notes
// with, in the same order — one categorization scheme for both.
const CATEGORY_TITLES: Record<string, ChangelogCategory> = {
  "Migrations & Config": "migrations",
  Features: "features",
  Fixes: "fixes",
  "Docs & Decisions": "docs",
  "Other Changes": "other",
}

function emptyCategories(): Record<ChangelogCategory, string[]> {
  return { migrations: [], features: [], fixes: [], docs: [], other: [] }
}

/**
 * Parses CHANGELOG.md content into per-version entries, newest first (the
 * file's own order). Skips an `## Unreleased` section — it has no publish
 * date and isn't a shipped version — and any heading that doesn't match
 * the `## v<version> — <date>` format. Never throws: a heading it can't
 * parse, or a line outside any recognized section, is silently dropped
 * rather than failing the whole build (see the Vite plugin for how a
 * missing/unreadable file itself is handled).
 */
export function parseChangelog(content: string): ChangelogVersion[] {
  const versions: ChangelogVersion[] = []
  let current: ChangelogVersion | null = null
  let currentCategory: ChangelogCategory | null = null

  for (const line of content.split("\n")) {
    const versionMatch = VERSION_HEADING.exec(line)
    if (versionMatch) {
      current = {
        version: versionMatch[1],
        date: versionMatch[2],
        categories: emptyCategories(),
      }
      versions.push(current)
      currentCategory = null
      continue
    }

    if (/^##\s+/.test(line)) {
      // Any other `##` heading (including `## Unreleased`) ends the
      // current version without starting a new one.
      current = null
      currentCategory = null
      continue
    }

    if (!current) continue

    const categoryMatch = CATEGORY_HEADING.exec(line)
    if (categoryMatch) {
      currentCategory = CATEGORY_TITLES[categoryMatch[1]] ?? null
      continue
    }

    if (!currentCategory) continue

    const itemMatch = LIST_ITEM.exec(line)
    if (itemMatch) current.categories[currentCategory].push(itemMatch[1])
  }

  return versions
}
