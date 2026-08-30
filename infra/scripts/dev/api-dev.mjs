#! /usr/bin/env node
/**
 * Runs `wrangler dev` for apps/api. --env-file .env.local is only passed if
 * it exists (wrangler otherwise exits on a missing path, breaking a fresh
 * worktree). Also fails before wrangler starts if a "must be overwritten"
 * var from .env.development still resolves to its own placeholder value.
 *
 * .env.local is machine-level, not per-branch, so a worktree without its
 * own copy falls back to the main worktree's — found via git-common-dir,
 * read live rather than copied/symlinked.
 *
 * Usage: npm run dev -w @twitch-radar/api
 */

import { existsSync, readFileSync } from "node:fs"
import { spawn, spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..")
const API_DIR = resolve(REPO_ROOT, "apps/api")
const ENV_DEVELOPMENT_PATH = resolve(REPO_ROOT, ".env.development")

function resolveEnvLocalPath() {
  const ownPath = resolve(REPO_ROOT, ".env.local")
  if (existsSync(ownPath)) return ownPath

  const commonDir = spawnSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  })
  if (commonDir.status !== 0) return ownPath

  const mainWorktreeRoot = resolve(REPO_ROOT, commonDir.stdout.trim(), "..")
  const mainPath = resolve(mainWorktreeRoot, ".env.local")
  return existsSync(mainPath) ? mainPath : ownPath
}

const ENV_LOCAL_PATH = resolveEnvLocalPath()

// Mirrors .env.development's "must be overwritten" section. Excludes
// EVENTSUB_WEBHOOK_SECRET — it's only ever compared against itself
// (subscriptions.ts sets it, webhooks.ts checks against the same value), so
// the placeholder works fine in dev.
const REQUIRE_LOCAL_OVERRIDE = [
  "TWITCH_CLIENT_SECRET",
  "VAPID_PRIVATE_KEY",
  "VAPID_PUBLIC_KEY",
]

function parseDotEnv(filePath) {
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

function assertLocalOverridesPresent() {
  const devVars = parseDotEnv(ENV_DEVELOPMENT_PATH)
  const localVars = existsSync(ENV_LOCAL_PATH)
    ? parseDotEnv(ENV_LOCAL_PATH)
    : {}

  const stillPlaceholder = REQUIRE_LOCAL_OVERRIDE.filter(
    (key) => (localVars[key] ?? devVars[key]) === devVars[key],
  )
  if (stillPlaceholder.length === 0) return

  console.error(
    `Missing real value(s) in .env.local: ${stillPlaceholder.join(", ")}\n` +
      "These still resolve to .env.development's placeholder. Add real values to .env.local (gitignored) to run `npm run dev`.",
  )
  process.exit(1)
}

assertLocalOverridesPresent()

const envFileArgs = ["--env-file", ENV_DEVELOPMENT_PATH]
if (existsSync(ENV_LOCAL_PATH)) {
  envFileArgs.push("--env-file", ENV_LOCAL_PATH)
}

const child = spawn(
  "npx",
  [
    "wrangler",
    "dev",
    "--port",
    "8787",
    "--inspector-port",
    "9229",
    ...envFileArgs,
  ],
  { cwd: API_DIR, stdio: "inherit", env: process.env },
)

const shutdown = () => child.kill()
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
child.on("exit", (code) => process.exit(code ?? 0))
