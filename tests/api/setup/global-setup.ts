import { spawn, type ChildProcess } from "node:child_process"
import { rmSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
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
const READY_TIMEOUT_MS = 60_000
const READY_POLL_INTERVAL_MS = 300

// Captures output instead of inheriting it, so a healthy run stays quiet
// (only vitest's own output prints) while a failure can still be diagnosed.
function spawnCapturing(
  command: string,
  args: string[],
  options: { cwd: string; detached?: boolean },
): { child: ChildProcess; readOutput: () => string } {
  const child = spawn(command, args, { ...options, stdio: "pipe" })
  const chunks: Buffer[] = []
  child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk))
  child.stderr?.on("data", (chunk: Buffer) => chunks.push(chunk))
  return { child, readOutput: () => Buffer.concat(chunks).toString("utf-8") }
}

function printCapturedOutput(label: string, output: string): void {
  if (!output.trim()) return
  console.error(`--- ${label} output ---\n${output}`)
}

function runToCompletion(command: string, args: string[]): Promise<void> {
  const { child, readOutput } = spawnCapturing(command, args, {
    cwd: REPO_ROOT,
  })
  return new Promise((resolve, reject) => {
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
        return
      }
      printCapturedOutput(`${command} ${args.join(" ")}`, readOutput())
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`))
    })
    child.on("error", reject)
  })
}

// Silences the dev server's own request logs so only vitest's test output
// shows; a crash after setup would otherwise go unnoticed until tests start
// timing out one by one, so it's still watched and fails the run immediately,
// printing whatever it wrote before dying.
function failOnUnexpectedExit(
  child: ChildProcess,
  label: string,
  isTornDown: () => boolean,
  readOutput: () => string,
): void {
  child.on("exit", (code, signal) => {
    if (isTornDown()) return
    printCapturedOutput(label, readOutput())
    console.error(
      `${label} exited unexpectedly during the test run (code=${code}, signal=${signal})`,
    )
    process.exit(1)
  })
}

function killProcessGroup(child: ChildProcess): void {
  if (child.pid === undefined || child.killed) return
  try {
    process.kill(-child.pid, "SIGTERM")
  } catch {
    // process group may already be gone
  }
}

async function waitForReady(url: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch (err) {
      lastError = err
    }
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_INTERVAL_MS))
  }
  throw new Error(`Timed out waiting for ${url} to become ready: ${lastError}`)
}

// A port collision (something else already listening) makes the spawned
// process exit immediately while the *other* thing on that port keeps
// answering health checks — waitForReady alone would then report "ready"
// against a process we didn't start. Racing against the child's own exit
// event turns that into a clear failure instead of a false positive.
function waitForExit(child: ChildProcess, label: string): Promise<never> {
  return new Promise((_resolve, reject) => {
    child.once("exit", (code, signal) => {
      reject(
        new Error(
          `${label} exited during setup (code=${code}, signal=${signal})`,
        ),
      )
    })
  })
}

function waitForReadyOrExit(
  url: string,
  child: ChildProcess,
  label: string,
): Promise<void> {
  return Promise.race([waitForReady(url), waitForExit(child, label)])
}

export default async function globalSetup() {
  // Throwaway D1/KV state, isolated from the dev DB the e2e tier and normal
  // `npm run dev` use — always wiped so each run starts from the migrations.
  rmSync(PERSIST_DIR, { recursive: true, force: true })
  await runToCompletion("npx", [
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
  ])

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
