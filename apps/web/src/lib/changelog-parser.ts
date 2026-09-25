// Parses the root CHANGELOG.md (ADR 0049) into structured data for the
// in-app "What's New" widget. Pure and dependency-free so it's unit
// testable without the Vite plugin (vite-plugins/changelog-plugin.ts) that
// wraps it for the `virtual:changelog` module.

export type ChangelogSection = "new" | "improved" | "fixed"

export interface ChangelogVersion {
  version: string
  date: string
  /** Optional plain-language paragraph between the version heading and its first section. */
  summary: string
  sections: Record<ChangelogSection, string[]>
}

const VERSION_HEADING = /^##\s+(v\S+)\s+[—-]\s+(\d{4}-\d{2}-\d{2})\s*$/
const SECTION_HEADING = /^###\s+(.+?)\s*$/
const LIST_ITEM = /^[-*]\s+(.+)$/

const SECTION_TITLES: Record<string, ChangelogSection> = {
  New: "new",
  Improved: "improved",
  Fixed: "fixed",
}

function emptySections(): Record<ChangelogSection, string[]> {
  return { new: [], improved: [], fixed: [] }
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
  let currentSection: ChangelogSection | null = null
  // The summary is only the prose before the first `###`; prose further
  // down (e.g. under an unrecognized section) must not leak into it.
  let inSummary = false

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim()

    const versionMatch = VERSION_HEADING.exec(line)
    if (versionMatch) {
      current = {
        version: versionMatch[1],
        date: versionMatch[2],
        summary: "",
        sections: emptySections(),
      }
      versions.push(current)
      currentSection = null
      inSummary = true
      continue
    }

    if (/^##\s+/.test(line)) {
      // Any other `##` heading (including `## Unreleased`) ends the
      // current version without starting a new one.
      current = null
      currentSection = null
      continue
    }

    if (!current || line === "") continue

    const sectionMatch = SECTION_HEADING.exec(line)
    if (sectionMatch) {
      currentSection = SECTION_TITLES[sectionMatch[1]] ?? null
      inSummary = false
      continue
    }

    if (inSummary) {
      current.summary = current.summary ? `${current.summary} ${line}` : line
      continue
    }

    if (!currentSection) continue

    const itemMatch = LIST_ITEM.exec(line)
    if (itemMatch) current.sections[currentSection].push(itemMatch[1])
  }

  return versions
}
