#! /usr/bin/env node
/**
 * Runs `wrangler dev` for apps/api. wrangler exits immediately if a
 * --env-file path doesn't exist, so a hardcoded pair of flags in
 * apps/api/package.json breaks `npm run dev` in a fresh worktree (no
 * .env.local yet). This script avoids that by:
 *
 * - always passing --env-file .env.development (committed, placeholder values)
 * - passing --env-file .env.local (gitignored, real secrets) only if it
 *   exists, still overriding .env.development since it's passed second
 *
 * Usage: npm run dev -w @twitch-radar/api
 */

import { existsSync } from "node:fs"
import { spawn } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..")
const API_DIR = resolve(REPO_ROOT, "apps/api")
const ENV_LOCAL_PATH = resolve(REPO_ROOT, ".env.local")

const envFileArgs = ["--env-file", resolve(REPO_ROOT, ".env.development")]
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
