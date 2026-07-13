#!/usr/bin/env node
// Automates the "Testing On Mobile" flow from the README:
// 1. Starts a cloudflared quick tunnel in front of the Vite dev server
// 2. Captures its random *.trycloudflare.com URL
// 3. Writes it into PUBLIC_URL in .env.local — the tunnel fronts Vite, which
//    serves the frontend directly and proxies /api to the worker, so this
//    one URL covers both (see PUBLIC_URL in apps/api/src/env.ts: API and web
//    are same-origin in every environment, dev included).
// 4. Prints a QR code of the tunnel URL so you scan-to-open on the mobile instead of typing it.
// 5. Starts `npm run dev` so the API worker picks up the new PUBLIC_URL on boot
//
// This does NOT register the Twitch redirect URI for you — Twitch has no
// public API for managing an app's redirect URIs, only the developer
// console UI, so that step stays manual (this script prints the exact URL
// and console link to paste it into).
//
// Usage: npm run dev:mobile

import { spawn } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import qrcode from "qrcode-terminal"

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..")
const ENV_LOCAL_PATH = resolve(REPO_ROOT, ".env.local")
const TUNNEL_URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/

function setEnvVar(lines, key, value) {
  const idx = lines.findIndex((line) => line.startsWith(`${key}=`))
  const newLine = `${key}=${value}`
  if (idx >= 0) {
    lines[idx] = newLine
  } else {
    if (lines.length && lines[lines.length - 1] !== "") lines.push("")
    lines.push(newLine)
  }
}

function updateTunnelUrl(tunnelUrl) {
  const existing = existsSync(ENV_LOCAL_PATH)
    ? readFileSync(ENV_LOCAL_PATH, "utf-8")
    : ""
  const lines = existing.split("\n")
  setEnvVar(lines, "PUBLIC_URL", tunnelUrl)
  writeFileSync(ENV_LOCAL_PATH, lines.join("\n"))
}

function waitForTunnelUrl(child) {
  return new Promise((resolve, reject) => {
    let settled = false
    const onData = (data) => {
      const text = data.toString()
      process.stderr.write(text)
      const match = text.match(TUNNEL_URL_PATTERN)
      if (match && !settled) {
        settled = true
        resolve(match[0])
      }
    }
    child.stderr.on("data", onData)
    child.on("exit", (code) => {
      if (!settled) reject(new Error(`cloudflared exited early (code ${code})`))
    })
    child.on("error", (err) => {
      if (!settled) reject(err)
    })
  })
}

async function main() {
  console.log(
    "Starting cloudflared quick tunnel for http://localhost:5173...\n",
  )
  const tunnel = spawn(
    "cloudflared",
    ["tunnel", "--url", "http://localhost:5173"],
    { stdio: ["ignore", "ignore", "pipe"] },
  )

  const tunnelUrl = await waitForTunnelUrl(tunnel)
  updateTunnelUrl(tunnelUrl)

  const callbackUrl = `${tunnelUrl}/api/auth/twitch/callback`
  console.log("\n" + "=".repeat(70))
  console.log(`Tunnel ready:  ${tunnelUrl}`)
  console.log(`PUBLIC_URL written to .env.local`)
  console.log("=".repeat(70))
  console.log(
    `\n1. Add this redirect URI in the Twitch console (if not already there):\n   ${callbackUrl}\n   https://dev.twitch.tv/console/apps`,
  )
  console.log(`\n2. Scan this on your phone to open the app:\n`)
  qrcode.generate(tunnelUrl, { small: true })
  console.log(
    "\nStarting `npm run dev`. Ctrl+C stops both the tunnel and the dev servers.\n",
  )

  const dev = spawn("npm", ["run", "dev"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  })

  const shutdown = () => {
    tunnel.kill()
    dev.kill()
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
  dev.on("exit", (code) => {
    tunnel.kill()
    process.exit(code ?? 0)
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
