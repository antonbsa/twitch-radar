/**
 * Shared dev env resolution for `npm run dev` (api-dev.mjs, vite.config.ts)
 * and the dev scripts that must talk to it (mock-eventsub.mjs,
 * dev-mobile.mjs), so every consumer sees the same merged values.
 *
 * Precedence, lowest to highest:
 *   1. <this worktree>/.env.development (committed placeholders/defaults)
 *   2. <main worktree>/.env.local (real secrets — machine-level, shared by
 *      every worktree via `git rev-parse --git-common-dir`, read live)
 *   3. <this worktree>/.env.local (per-worktree overrides, e.g. ports or a
 *      tunnel PUBLIC_URL written by dev-mobile.mjs)
 *
 * All three are merged, not first-match: a worktree-local .env.local that only
 * sets PUBLIC_URL must not hide the main worktree's secrets.
 */

import { existsSync, readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..")

const DEFAULT_PORTS = {
  API_DEV_PORT: "8787",
  API_INSPECTOR_PORT: "9229",
  WEB_DEV_PORT: "5173",
}

export function parseDotEnv(filePath) {
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

function resolveMainWorktreeRoot(repoRoot) {
  const commonDir = spawnSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: repoRoot,
    encoding: "utf-8",
  })
  if (commonDir.status !== 0) return null
  return resolve(repoRoot, commonDir.stdout.trim(), "..")
}

// In the main worktree itself, layers 2 and 3 are the same file and are
// deduplicated.
function resolveEnvFilePaths(repoRoot = REPO_ROOT) {
  const developmentPath = resolve(repoRoot, ".env.development")
  const ownLocalPath = resolve(repoRoot, ".env.local")
  const mainRoot = resolveMainWorktreeRoot(repoRoot)
  const mainLocalPath = mainRoot ? resolve(mainRoot, ".env.local") : null

  const localPaths = [mainLocalPath, ownLocalPath].filter(
    (path, i, all) => path && existsSync(path) && all.indexOf(path) === i,
  )
  return { developmentPath, localPaths }
}

/**
 * Merges the env files and derives the dev ports/origin.
 *
 * Port vars can also come from `process.env`, which wins over every file —
 * the e2e tier sets API_DEV_PORT there to point Vite's proxy at its own
 * wrangler instance.
 *
 * PUBLIC_URL is only taken as-is when a .env.local sets it; otherwise it's
 * derived from WEB_DEV_PORT. wrangler's --env-file doesn't interpolate, so
 * .env.development's literal default can't track a per-worktree port itself.
 */
export function loadDevEnv(repoRoot = REPO_ROOT) {
  const { developmentPath, localPaths } = resolveEnvFilePaths(repoRoot)
  const developmentVars = parseDotEnv(developmentPath)
  const localVars = Object.assign({}, ...localPaths.map(parseDotEnv))
  const vars = { ...developmentVars, ...localVars }

  const port = (key) => process.env[key] ?? vars[key] ?? DEFAULT_PORTS[key]
  const webPort = port("WEB_DEV_PORT")

  return {
    vars,
    developmentVars,
    // Existing files in precedence order (last wins) — pass as repeated
    // `wrangler dev --env-file` flags; wrangler exits on a missing path.
    envFilePaths: [developmentPath, ...localPaths],
    apiPort: port("API_DEV_PORT"),
    inspectorPort: port("API_INSPECTOR_PORT"),
    webPort,
    publicUrl: localVars.PUBLIC_URL ?? `http://localhost:${webPort}`,
  }
}
