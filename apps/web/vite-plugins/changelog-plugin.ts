import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { Plugin } from "vite"
import {
  parseChangelog,
  withEnglishFallback,
  type ChangelogVersion,
} from "../src/lib/changelog-parser"

const VIRTUAL_MODULE_ID = "virtual:changelog"
const RESOLVED_VIRTUAL_MODULE_ID = "\0" + VIRTUAL_MODULE_ID

// Duplicated from lib/i18n.ts because its browser-only catalog loader reads
// `import.meta.env`, which is unavailable under this plugin's Node tsconfig.
type Language = "en" | "pt-BR" | "es"
const SUPPORTED_LANGUAGES: Language[] = ["en", "pt-BR", "es"]

// English uses CHANGELOG.md; other languages use CHANGELOG.<lang>.md.
const CHANGELOG_FILENAMES: Record<Language, string> = {
  en: "CHANGELOG.md",
  "pt-BR": "CHANGELOG.pt-BR.md",
  es: "CHANGELOG.es.md",
}

/** Exposes parsed repo-root changelog files as the `virtual:changelog` module. */
export function changelogPlugin(): Plugin {
  const pathFor = (filename: string) =>
    fileURLToPath(new URL(`../../../${filename}`, import.meta.url))

  return {
    name: "changelog",
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) return RESOLVED_VIRTUAL_MODULE_ID
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_MODULE_ID) return

      const readAndParse = (language: Language): ChangelogVersion[] => {
        const path = pathFor(CHANGELOG_FILENAMES[language])
        this.addWatchFile(path)
        try {
          return parseChangelog(readFileSync(path, "utf-8"))
        } catch (error) {
          this.warn(
            `virtual:changelog: could not read/parse ${CHANGELOG_FILENAMES[language]} (${String(error)})`,
          )
          return []
        }
      }

      const english = readAndParse("en")
      const changelogs = Object.fromEntries(
        SUPPORTED_LANGUAGES.map((language) => [
          language,
          language === "en"
            ? english
            : withEnglishFallback(english, readAndParse(language)),
        ]),
      ) as Record<Language, ChangelogVersion[]>

      return `export const changelogs = ${JSON.stringify(changelogs)}`
    },
  }
}
