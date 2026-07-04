import { existsSync, readFileSync } from "fs"
import { resolve } from "path"

function parseDevVars(filePath: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(filePath, "utf-8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const idx = line.indexOf("=")
        return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()]
      }),
  )
}

// Single source of truth for dev env vars (see AGENTS.md "Env Vars: Single
// Source Of Truth"): `.env.development` (committed placeholders), overridden
// by the gitignored `.env.local`.
export function loadDevVars(): Record<string, string> {
  const localPath = resolve(import.meta.dirname, ".env.local")
  return {
    ...parseDevVars(resolve(import.meta.dirname, ".env.development")),
    ...(existsSync(localPath) ? parseDevVars(localPath) : {}),
  }
}
