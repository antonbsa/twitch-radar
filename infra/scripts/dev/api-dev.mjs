#! /usr/bin/env node
/**
 * Runs `wrangler dev` for apps/api with the merged env from load-env.mjs:
 * every existing env file is passed as `--env-file`, in precedence order.
 * Fails before wrangler starts if a "must be overwritten" var from
 * .env.development still resolves to its own placeholder value.
 *
 * Usage: npm run dev -w @twitch-radar/api
 */

import { spawn } from "node:child_process"
import { resolve } from "node:path"
import { loadDevEnv, REPO_ROOT } from "./load-env.mjs"

const API_DIR = resolve(REPO_ROOT, "apps/api")

// Mirrors .env.development's "must be overwritten" section. Excludes
// EVENTSUB_WEBHOOK_SECRET — it's only ever compared against itself
// (subscriptions.ts sets it, webhooks.ts checks against the same value), so
// the placeholder works fine in dev.
const REQUIRE_LOCAL_OVERRIDE = [
  "TWITCH_CLIENT_SECRET",
  "VAPID_PRIVATE_KEY",
  "VAPID_PUBLIC_KEY",
]

const env = loadDevEnv()

function assertLocalOverridesPresent() {
  const stillPlaceholder = REQUIRE_LOCAL_OVERRIDE.filter(
    (key) => env.vars[key] === env.developmentVars[key],
  )
  if (stillPlaceholder.length === 0) return

  console.error(
    `Missing real value(s) in .env.local: ${stillPlaceholder.join(", ")}\n` +
      "These still resolve to .env.development's placeholder in every .env.local checked (this worktree's and the main worktree's). Add real values to .env.local (gitignored) to run `npm run dev`.",
  )
  process.exit(1)
}

assertLocalOverridesPresent()

const child = spawn(
  "npx",
  [
    "wrangler",
    "dev",
    "--port",
    env.apiPort,
    "--inspector-port",
    env.inspectorPort,
    ...env.envFilePaths.flatMap((path) => ["--env-file", path]),
    // Derived from WEB_DEV_PORT unless a .env.local sets it (see load-env.mjs).
    "--var",
    `PUBLIC_URL:${env.publicUrl}`,
  ],
  { cwd: API_DIR, stdio: "inherit", env: process.env },
)

const shutdown = () => child.kill()
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
child.on("exit", (code) => process.exit(code ?? 0))
