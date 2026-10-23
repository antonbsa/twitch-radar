#! /usr/bin/env node
/**
 * Checks the local prerequisites for `npm run dev` and names the guide
 * section that fixes each failure. Exits 1 on any failure; a missing
 * `cloudflared` only warns (it is needed for phone testing).
 *
 * Usage: npm run doctor
 */

import { spawnSync } from "node:child_process"
import { createECDH } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { loadDevEnv, REPO_ROOT } from "./load-env.mjs"

const GUIDE = "docs/guides/run-locally.md"
const env = loadDevEnv()

/** Each check returns null when it passes, else a message; `warn` checks don't fail the run. */
const checks = [
  {
    name: "Node version",
    section: "Prerequisites",
    run() {
      const want = readFileSync(resolve(REPO_ROOT, ".nvmrc"), "utf-8").trim()
      const have = process.versions.node
      // .nvmrc is the minimum major; newer majors are fine
      return Number(have.split(".")[0]) >= Number(want)
        ? null
        : `Node ${have} is running, .nvmrc requires ${want} or newer`
    },
  },
  {
    name: "Dependencies installed",
    section: "Install",
    run() {
      return existsSync(resolve(REPO_ROOT, "node_modules"))
        ? null
        : "node_modules is missing"
    },
  },
  {
    name: "Local D1 migrations applied",
    section: "Set Up The Database",
    run() {
      const result = spawnSync(
        "npx",
        ["wrangler", "d1", "migrations", "list", "twitch-radar-dev", "--local"],
        { cwd: resolve(REPO_ROOT, "apps/api"), encoding: "utf-8" },
      )
      if (result.status !== 0)
        return `wrangler could not list migrations: ${result.stderr.trim().split("\n")[0]}`
      return result.stdout.includes("No migrations to apply")
        ? null
        : "migrations are pending"
    },
  },
  {
    name: "Twitch credentials",
    section: "Add Your Credentials",
    run() {
      const missing = ["TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET"].filter(
        (key) =>
          !env.vars[key] ||
          (key === "TWITCH_CLIENT_SECRET" &&
            env.vars[key] === env.developmentVars[key]),
      )
      return missing.length === 0
        ? null
        : `${missing.join(", ")} missing or still the placeholder`
    },
  },
  {
    name: "VAPID key pair",
    section: "Add Your Credentials",
    run() {
      const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv } = env.vars
      const invalid =
        "VAPID keys are missing, a placeholder or not a P-256 pair"
      if (!pub || !priv) return invalid
      try {
        const ecdh = createECDH("prime256v1")
        ecdh.setPrivateKey(Buffer.from(priv, "base64url"))
        return ecdh.getPublicKey().equals(Buffer.from(pub, "base64url"))
          ? null
          : invalid
      } catch {
        return invalid
      }
    },
  },
  {
    name: "cloudflared installed",
    section: "Choose A Route",
    warn: true,
    guide: "docs/guides/test-on-phone.md",
    run() {
      return spawnSync("cloudflared", ["--version"]).error
        ? "cloudflared not found (only needed for `npm run dev:mobile`)"
        : null
    },
  },
]

let failed = false
for (const check of checks) {
  const problem = check.run()
  if (!problem) {
    console.log(`ok    ${check.name}`)
    continue
  }
  if (!check.warn) failed = true
  console.log(`${check.warn ? "warn" : "FAIL"}  ${check.name}: ${problem}`)
  console.log(`      see ${check.guide ?? GUIDE}, "${check.section}"`)
}

process.exit(failed ? 1 : 0)
