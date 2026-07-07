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

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../..")
const API_HEALTH_URL = "http://localhost:8787/health"
const WEB_URL = "http://localhost:5173/"

export default async function globalSetup() {
  await runToCompletion("npm", ["run", "db:setup"], REPO_ROOT)

  const { child: api, readOutput: readApiOutput } = spawnCapturing(
    "npx",
    [
      "wrangler",
      "dev",
      "--port",
      "8787",
      // Only .env.development — its placeholders cover every required var
      // (see AGENTS.md "Env Vars: Single Source Of Truth"). .env.local exists
      // to override real OAuth secrets for `npm run dev`; tests never do a
      // real OAuth round-trip and the file isn't expected to exist in CI.
      "--env-file",
      "../../.env.development",
    ],
    { cwd: resolve(REPO_ROOT, "apps/api"), detached: true },
  )
  const { child: web, readOutput: readWebOutput } = spawnCapturing(
    "npx",
    ["vite", "--port", "5173", "--strictPort"],
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
