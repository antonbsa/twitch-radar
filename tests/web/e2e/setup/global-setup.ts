import { rm } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  failOnUnexpectedExit,
  killProcessGroup,
  printCapturedOutput,
  runToCompletion,
  spawnCapturing,
  waitForReadyOrExit,
} from "../../../shared/setup/process-lifecycle"
import { generateTestVapidKeys } from "../../../shared/setup/vapid"
import { E2E_API_PORT, E2E_API_URL, E2E_WEB_PORT, E2E_WEB_URL } from "./ports"

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../..")
const API_HEALTH_URL = `${E2E_API_URL}/health`
const WEB_URL = `${E2E_WEB_URL}/`

export default async function globalSetup() {
  // Failure screenshots (see setup/fixtures.ts) accumulate across runs
  // otherwise - wipe last run's before this one writes its own, so the
  // folder only ever reflects the most recent run.
  await rm(resolve(REPO_ROOT, "test-results"), {
    recursive: true,
    force: true,
  })

  await runToCompletion("npm", ["run", "db:setup"], REPO_ROOT)

  const vapidKeys = await generateTestVapidKeys()

  const { child: api, readOutput: readApiOutput } = spawnCapturing(
    "npx",
    [
      "wrangler",
      "dev",
      "--port",
      String(E2E_API_PORT),
      // .env.development — its placeholders cover every required var (see
      // AGENTS.md "Env Vars: Single Source Of Truth"). .env.local exists to
      // override real OAuth secrets for `npm run dev`; tests never do a real
      // OAuth round-trip and the file isn't expected to exist in CI.
      "--env-file",
      "../../.env.development",
      // .env.development's VAPID keys and TWITCH_CLIENT_SECRET are
      // placeholders that services/twitch/client.ts and web-push.ts now
      // reject before doing real work (so `npm run dev` fails loud instead
      // of an opaque 401/DOMException). The account.spec.ts push flow
      // exercises the real vapid-public-key endpoint, so it needs a real
      // (throwaway) pair; TWITCH_CLIENT_SECRET just needs to not be the
      // literal placeholder string since these tests never do a real OAuth
      // round-trip.
      "--var",
      `VAPID_PUBLIC_KEY:${vapidKeys.publicKey}`,
      "--var",
      `VAPID_PRIVATE_KEY:${vapidKeys.privateKey}`,
      "--var",
      "TWITCH_CLIENT_SECRET:test-client-secret",
      // Match this tier's own vite port instead of npm run dev's.
      "--var",
      `PUBLIC_URL:${E2E_WEB_URL}`,
    ],
    { cwd: resolve(REPO_ROOT, "apps/api"), detached: true },
  )
  // vite.config.ts's proxy reads API_DEV_PORT to target this wrangler.
  process.env.API_DEV_PORT = String(E2E_API_PORT)
  const { child: web, readOutput: readWebOutput } = spawnCapturing(
    "npx",
    ["vite", "--port", String(E2E_WEB_PORT), "--strictPort"],
    { cwd: resolve(REPO_ROOT, "apps/web"), detached: true },
  )

  try {
    await Promise.all([
      waitForReadyOrExit(API_HEALTH_URL, api, "wrangler dev"),
      waitForReadyOrExit(WEB_URL, web, "vite"),
    ])
  } catch (err) {
    printCapturedOutput("wrangler dev", readApiOutput())
    printCapturedOutput("vite", readWebOutput())
    killProcessGroup(api)
    killProcessGroup(web)
    throw err
  }

  let tornDown = false
  failOnUnexpectedExit(api, "wrangler dev", () => tornDown, readApiOutput)
  failOnUnexpectedExit(web, "vite", () => tornDown, readWebOutput)

  return async () => {
    tornDown = true
    killProcessGroup(api)
    killProcessGroup(web)
  }
}
