#!/usr/bin/env node
/**
 * Fails if the production API or web bundle still contains test-seam or
 * sandbox code (ADR 0045, ADR 0046). Builds both with the production config
 * into temp directories and searches them for strings only that code carries.
 *
 * Usage: node infra/scripts/check-production-bundle.mjs
 */

import { spawnSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../..")
const API_DIR = resolve(REPO_ROOT, "apps/api")
const WEB_DIR = resolve(REPO_ROOT, "apps/web")

// Strings that exist only in excluded code: fixed identities, handler bodies, i18n keys.
// Not route paths: esbuild leaves the dead `if (false)` branch in the API bundle
// unminified, so a path literal there is unreachable but still greppable.
const FORBIDDEN = {
  api: [
    "Invalid persona",
    "usr_sandbox_",
    "sbx_bc_",
    "usr_e2e",
    "e2e_twitch_user",
  ],
  web: ["__sandbox__", "sandbox.persona", "usr_sandbox_"],
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" })
  if (result.status !== 0) {
    console.error(result.stdout, result.stderr)
    process.exit(result.status ?? 1)
  }
}

function filesIn(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(js|mjs|html)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
}

function findForbidden(dir, strings) {
  const contents = filesIn(dir).map((file) => readFileSync(file, "utf8"))
  return strings.filter((s) => contents.some((text) => text.includes(s)))
}

const workDir = mkdtempSync(join(tmpdir(), "bundle-check-"))
try {
  const webOut = join(workDir, "web")
  run("npx", ["vite", "build", "--outDir", webOut, "--emptyOutDir"], WEB_DIR)

  // wrangler's dry run still validates the assets directory, so it must exist.
  mkdirSync(resolve(WEB_DIR, "dist"), { recursive: true })
  const apiOut = join(workDir, "api")
  run(
    "npx",
    [
      "wrangler",
      "deploy",
      "--env",
      "production",
      "--dry-run",
      "--outdir",
      apiOut,
    ],
    API_DIR,
  )

  const leaks = [
    ...findForbidden(apiOut, FORBIDDEN.api).map((s) => `api: ${s}`),
    ...findForbidden(webOut, FORBIDDEN.web).map((s) => `web: ${s}`),
  ]
  if (leaks.length > 0) {
    console.error(
      `Production bundle contains non-production code:\n${leaks.map((l) => `  ${l}`).join("\n")}\nGuard it with __NON_PRODUCTION_FEATURES__ (ADR 0045).`,
    )
    process.exit(1)
  }
  console.log("Production bundles contain no test-seam or sandbox code")
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
