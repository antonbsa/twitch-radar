#!/usr/bin/env node
// Runs apps/api against real preview Cloudflare bindings (D1, KV) via
// `wrangler dev --env preview --remote`, without touching wrangler.jsonc:
//
// - Queues bindings break `--remote` (503, edge error 1105), so this
//   generates a queues-stripped copy of the preview config on the fly.
// - `env.preview`'s PUBLIC_URL is the published Worker's own OAuth
//   redirect_uri, which would otherwise bounce login there instead of back
//   to this local run (docs/notes/0004) — overridden here via --var.
//
// One-time setup: add http://localhost:8787/api/auth/twitch/callback as a
// redirect URI on the Twitch app (dev.twitch.tv/console/apps).
//
// Usage: npm run dev:remote

import { spawn } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parse as parseJsonc } from "jsonc-parser"

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..")
const API_DIR = resolve(REPO_ROOT, "apps/api")
const SOURCE_CONFIG_PATH = resolve(API_DIR, "wrangler.jsonc")
// Wrangler resolves a config's relative paths (main, migrations_dir,
// assets.directory) against the directory the config file itself lives in,
// not the invoking cwd — so this has to sit next to wrangler.jsonc, not in a
// subdirectory, for those paths to keep working unchanged. Explicitly
// gitignored (see root .gitignore) since it's generated, not committed.
const GENERATED_CONFIG_PATH = resolve(
  API_DIR,
  "wrangler.generated-preview-remote.jsonc",
)
const ENV_NAME = "preview"
const LOCAL_PUBLIC_URL = "http://localhost:8787"

function generateQueuelessConfig() {
  const errors = []
  const config = parseJsonc(readFileSync(SOURCE_CONFIG_PATH, "utf-8"), errors)
  if (errors.length > 0) {
    throw new Error(
      `Failed to parse ${SOURCE_CONFIG_PATH}: ${JSON.stringify(errors)}`,
    )
  }
  // Top-level `queues` isn't actually used once `--env preview` is passed
  // (named environments don't inherit top-level bindings), but leaving it in
  // place makes Wrangler warn that it "exists at the top level, but not on
  // env.preview" — dropping both avoids the noise.
  delete config.queues
  delete config.env?.[ENV_NAME]?.queues
  writeFileSync(GENERATED_CONFIG_PATH, JSON.stringify(config, null, 2))
}

generateQueuelessConfig()

console.log(`Starting wrangler dev --env ${ENV_NAME} --remote (no queues)...`)
const child = spawn(
  "npx",
  [
    "wrangler",
    "dev",
    "--config",
    GENERATED_CONFIG_PATH,
    "--env",
    ENV_NAME,
    "--remote",
    "--var",
    `PUBLIC_URL:${LOCAL_PUBLIC_URL}`,
  ],
  { cwd: API_DIR, stdio: "inherit" },
)

const shutdown = () => child.kill()
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
child.on("exit", (code) => process.exit(code ?? 0))
