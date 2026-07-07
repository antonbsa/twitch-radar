import { rmSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  failOnUnexpectedExit,
  killProcessGroup,
  printCapturedOutput,
  runToCompletion,
  spawnCapturing,
  waitForReadyOrExit,
} from "../../shared/setup/process-lifecycle"
import { startMockTwitchServer } from "./mock-twitch-server"
import {
  API_TEST_PORT,
  API_TEST_URL,
  MOCK_TWITCH_PORT,
  MOCK_TWITCH_URL,
} from "./ports"

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..")
const PERSIST_DIR = resolve(REPO_ROOT, ".wrangler/state/test")
// Distinct from the dev/e2e tiers' default (9229) so all three can run at once.
const INSPECTOR_PORT = 9230

export default async function globalSetup() {
  // Throwaway D1/KV state, isolated from the dev DB the e2e tier and normal
  // `npm run dev` use — always wiped so each run starts from the migrations.
  rmSync(PERSIST_DIR, { recursive: true, force: true })
  await runToCompletion(
    "npx",
    [
      "wrangler",
      "d1",
      "migrations",
      "apply",
      "twitch-radar-dev",
      "--local",
      "--config",
      "apps/api/wrangler.jsonc",
      "--persist-to",
      PERSIST_DIR,
    ],
    REPO_ROOT,
  )

  const mockTwitch = await startMockTwitchServer(MOCK_TWITCH_PORT)

  const { child: worker, readOutput } = spawnCapturing(
    "npx",
    [
      "wrangler",
      "dev",
      "--config",
      "apps/api/wrangler.jsonc",
      "--port",
      String(API_TEST_PORT),
      "--inspector-port",
      String(INSPECTOR_PORT),
      "--persist-to",
      PERSIST_DIR,
      // Only .env.development — its placeholders cover every required var
      // (see AGENTS.md "Env Vars: Single Source Of Truth"). .env.local exists
      // to override real OAuth secrets for `npm run dev`; tests never do a
      // real OAuth round-trip and the file isn't expected to exist in CI.
      "--env-file",
      resolve(REPO_ROOT, ".env.development"),
      // Redirects the worker's outbound Twitch calls to the in-process mock
      // above — overrides env.ts's real-Twitch defaults for this run only,
      // never persisted to .env.development/.env.local.
      "--var",
      `TWITCH_AUTH_BASE_URL:${MOCK_TWITCH_URL}`,
      "--var",
      `TWITCH_API_BASE_URL:${MOCK_TWITCH_URL}`,
    ],
    { cwd: REPO_ROOT, detached: true },
  )

  try {
    await waitForReadyOrExit(`${API_TEST_URL}/health`, worker, "wrangler dev")
  } catch (err) {
    printCapturedOutput("wrangler dev", readOutput())
    mockTwitch.server.close()
    killProcessGroup(worker)
    throw err
  }

  let tornDown = false
  failOnUnexpectedExit(worker, "wrangler dev", () => tornDown, readOutput)

  return async () => {
    tornDown = true
    mockTwitch.server.close()
    killProcessGroup(worker)
  }
}
