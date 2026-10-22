// Publishes or removes failed-CI test reports in the separate Pages repo (ADR 0060).
// Usage: node ci-reports.mjs publish <pr> <run_id> <run_url> <reports_dir>
//        node ci-reports.mjs remove <pr>
// Env: CI_REPORTS_DEPLOY_KEY (private SSH deploy key with write access to the reports repo),
// GITHUB_REPOSITORY (set by Actions). The reports repo is `<owner>/<repo>-ci-reports`, so a clone publishes to its own.
// Prints the published run's URL on stdout; everything else goes to stderr.
import { execFileSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const [owner, name] = (process.env.GITHUB_REPOSITORY ?? "").split("/")
const REPO = `${owner}/${name}-ci-reports`
const PAGES_URL = `https://${owner.toLowerCase()}.github.io/${name}-ci-reports`
const TIERS = { api: "API tests", unit: "Web unit tests", e2e: "E2E tests" }
const INDEX_CSS = `
:root{color-scheme:light dark}
body{margin:0;font:16px/1.5 system-ui,sans-serif;background:Canvas;color:CanvasText}
main{max-width:860px;margin:0 auto;padding:32px 20px}
h1{font-size:1.6rem;margin:0 0 4px}
section{margin-top:24px;padding:16px 20px;border:1px solid color-mix(in srgb,CanvasText 18%,transparent);border-radius:10px}
h2{font-size:1.1rem;margin:0 0 8px}
ul{margin:0;padding-left:20px}
a{color:#2563eb}
`

const [command, pr, ...rest] = process.argv.slice(2)
const key = process.env.CI_REPORTS_DEPLOY_KEY
if (
  !owner ||
  !name ||
  !key ||
  !["publish", "remove"].includes(command) ||
  !pr
) {
  console.error(
    "Usage: ci-reports.mjs publish <pr> <run_id> <run_url> <reports_dir> | remove <pr>",
  )
  process.exit(1)
}

const work = mkdtempSync(join(tmpdir(), "ci-reports-"))
const keyFile = join(work, "deploy-key")
writeFileSync(keyFile, key.endsWith("\n") ? key : `${key}\n`, { mode: 0o600 })
const repoDir = join(work, "repo")
const prDir = join(repoDir, `pr-${pr}`)
const git = (...args) =>
  execFileSync("git", args, {
    cwd: repoDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    env: {
      ...process.env,
      GIT_SSH_COMMAND: `ssh -i ${keyFile} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`,
    },
  }).trim()

// Concurrent runs each rewrite main, so a push is only accepted if main is still
// the commit this attempt started from (--force-with-lease); otherwise redo it on the new main.
const MAX_ATTEMPTS = 5
for (let attempt = 1; ; attempt++) {
  rmSync(repoDir, { recursive: true, force: true })
  mkdirSync(repoDir)
  git("init", "--quiet", "--initial-branch=main")
  git("remote", "add", "origin", `git@github.com:${REPO}.git`)
  let base = ""
  try {
    git("fetch", "--quiet", "--depth=1", "origin", "main")
    base = git("rev-parse", "FETCH_HEAD")
    git("checkout", "--quiet", "FETCH_HEAD", "--", ".")
  } catch {
    // brand-new, empty reports repo
  }

  if (command === "remove" && base && !existsSync(prDir)) {
    console.error(`No reports for PR #${pr}; nothing to remove.`)
    process.exit(0)
  }
  rmSync(prDir, { recursive: true, force: true })
  if (command === "publish") publish()
  writeFileSync(join(repoDir, ".nojekyll"), "")

  // Every publish rewrites main as one orphan commit so the repo never grows.
  git("checkout", "--quiet", "--orphan", "snapshot")
  git("add", "-A")
  git(
    "-c",
    "user.name=ci-reports",
    "-c",
    "user.email=ci-reports@users.noreply.github.com",
    "commit",
    "--quiet",
    "-m",
    `Reports of open PRs (${command} #${pr})`,
  )
  try {
    git("push", `--force-with-lease=main:${base}`, "origin", "snapshot:main")
    if (command === "publish") console.log(`${PAGES_URL}/pr-${pr}/${rest[0]}/`)
    break
  } catch (error) {
    if (attempt === MAX_ATTEMPTS) throw error
    console.error(
      `Push rejected (attempt ${attempt}); retrying on the new main.`,
    )
  }
}

function publish() {
  const [runId, runUrl, reportsDir] = rest
  const target = join(prDir, runId)
  cpSync(reportsDir, target, { recursive: true })
  writeFileSync(join(target, "index.html"), renderIndex(target, runId, runUrl))
}

function listFiles(dir, ext) {
  return existsSync(dir)
    ? readdirSync(dir).filter((name) => name.endsWith(ext))
    : []
}

function renderIndex(target, runId, runUrl) {
  const base = `${PAGES_URL}/pr-${pr}/${runId}`
  const link = (href, label) => `<li><a href="${href}">${label}</a></li>`
  const sections = Object.entries(TIERS)
    .filter(([tier]) => existsSync(join(target, tier)))
    .map(([tier, title]) => {
      const dir = join(target, tier)
      const items = []
      if (existsSync(join(dir, "report", "index.html"))) {
        items.push(link(`${tier}/report/`, "Vitest report"))
      }
      for (const log of listFiles(join(dir, "logs"), ".log")) {
        items.push(link(`${tier}/logs/${log}`, `Server log: ${log}`))
      }
      for (const trace of listFiles(join(dir, "traces"), ".zip")) {
        const url = encodeURIComponent(`${base}/${tier}/traces/${trace}`)
        items.push(
          link(`https://trace.playwright.dev/?trace=${url}`, `Trace: ${trace}`),
        )
      }
      return `<section><h2>${title}</h2><ul>${items.join("")}</ul></section>`
    })
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PR #${pr} test report</title>
<style>${INDEX_CSS}</style>
<main>
<h1>PR #${pr} test report</h1>
<p><a href="${runUrl}">Workflow run</a></p>
${sections.join("\n")}
</main>
`
}
