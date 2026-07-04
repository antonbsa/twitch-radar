import { spawn, type ChildProcess } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../..")
const API_HEALTH_URL = "http://localhost:8787/health"
const WEB_URL = "http://localhost:5173/"
const READY_TIMEOUT_MS = 60_000
const READY_POLL_INTERVAL_MS = 300

function runToCompletion(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: REPO_ROOT, stdio: "inherit" })
    child.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`))
    })
    child.on("error", reject)
  })
}

function spawnDetached(
  command: string,
  args: string[],
  cwd: string,
): ChildProcess {
  return spawn(command, args, { cwd, stdio: "inherit", detached: true })
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
  await runToCompletion("npm", ["run", "db:setup"])

  const api = spawnDetached(
    "npx",
    [
      "wrangler",
      "dev",
      "--port",
      "8787",
      "--env-file",
      "../../.env.development",
      "--env-file",
      "../../.env.local",
    ],
    resolve(REPO_ROOT, "apps/api"),
  )
  const web = spawnDetached(
    "npx",
    ["vite", "--port", "5173", "--strictPort"],
    resolve(REPO_ROOT, "apps/web"),
  )

  try {
    await Promise.all([
      waitForReadyOrExit(API_HEALTH_URL, api, "wrangler dev"),
      waitForReadyOrExit(WEB_URL, web, "vite"),
    ])
  } catch (err) {
    killProcessGroup(api)
    killProcessGroup(web)
    throw err
  }

  return async () => {
    killProcessGroup(api)
    killProcessGroup(web)
  }
}
