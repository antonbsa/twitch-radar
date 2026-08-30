#!/usr/bin/env node
/**
 * Fails if a required secret was never set via `wrangler secret put` for
 * the given environment. `wrangler secret list` only returns names, so this
 * checks presence, not correctness.
 *
 * Usage: node infra/scripts/deploy/check-secrets.mjs --env production
 */

import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..")
const API_DIR = resolve(REPO_ROOT, "apps/api")

const REQUIRED_SECRETS = [
  "TWITCH_CLIENT_SECRET",
  "EVENTSUB_WEBHOOK_SECRET",
  "TOKEN_ENCRYPTION_KEY",
  "VAPID_PRIVATE_KEY",
]

const envIndex = process.argv.indexOf("--env")
const env = envIndex >= 0 ? process.argv[envIndex + 1] : undefined
if (!env) {
  console.error(
    "Usage: node infra/scripts/deploy/check-secrets.mjs --env <production|preview>",
  )
  process.exit(1)
}

const result = spawnSync("npx", ["wrangler", "secret", "list", "--env", env], {
  cwd: API_DIR,
  encoding: "utf-8",
})
if (result.status !== 0) {
  console.error(result.stderr || result.stdout)
  process.exit(result.status ?? 1)
}

const existingSecrets = new Set(JSON.parse(result.stdout).map((s) => s.name))
const missingSecrets = REQUIRED_SECRETS.filter(
  (name) => !existingSecrets.has(name),
)

if (missingSecrets.length > 0) {
  console.error(
    `Missing required secret(s) for --env ${env}: ${missingSecrets.join(", ")}\n` +
      `Set them with: wrangler secret put <NAME> --env ${env}`,
  )
  process.exit(1)
}

console.log(`All required secrets present for --env ${env}.`)
