import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { Plugin } from "vite"
import { parseChangelog } from "../src/lib/changelog-parser"

const VIRTUAL_MODULE_ID = "virtual:changelog"
const RESOLVED_VIRTUAL_MODULE_ID = "\0" + VIRTUAL_MODULE_ID

/**
 * Exposes the repo-root CHANGELOG.md (ADR 0049) as the `virtual:changelog`
 * module, parsed at build/dev-server time rather than checked into the
 * repo as generated JSON. A missing or unreadable file degrades to an
 * empty list with a build warning instead of failing the build — the
 * changelog is display-only, not something that should block a deploy.
 */
export function changelogPlugin(): Plugin {
  const changelogPath = fileURLToPath(
    new URL("../../../CHANGELOG.md", import.meta.url),
  )

  return {
    name: "changelog",
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) return RESOLVED_VIRTUAL_MODULE_ID
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_MODULE_ID) return

      this.addWatchFile(changelogPath)

      let versions: ReturnType<typeof parseChangelog> = []
      try {
        versions = parseChangelog(readFileSync(changelogPath, "utf-8"))
      } catch (error) {
        this.warn(
          `virtual:changelog: could not read/parse CHANGELOG.md, the "What's New" widget will show no versions (${String(error)})`,
        )
      }

      return `export const changelog = ${JSON.stringify(versions)}`
    },
  }
}
