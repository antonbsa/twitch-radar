// Runs a throwaway e2e screenshot spec against this worktree and, with --before, also against origin/main (files get -after/-before suffixes).
// Usage: npm run pr:screenshot -- <spec> [--before]
// See .claude/skills/capturing-ui-screenshots/SKILL.md.
import { execFileSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { parseArgs } from "node:util"

const OUT_DIR = "test-results/pr-screenshots"
const HELPER = "tests/web/e2e/setup/screenshot.ts"

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { before: { type: "boolean", default: false } },
})
const [spec] = positionals
if (!spec) {
  console.error("Usage: npm run pr:screenshot -- <spec> [--before]")
  process.exit(1)
}

const root = process.cwd()
if (!existsSync(join(root, spec))) {
  console.error(`Spec not found: ${spec}`)
  process.exit(1)
}

function run(command, args, cwd, env = {}) {
  execFileSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env },
  })
}

/** `label` is only set for --before runs; an empty SCREENSHOT_LABEL makes the helper skip the suffix. */
function runSpec(cwd, label = "") {
  run("npx", ["vitest", "run", "--config", "vitest.e2e.config.ts", spec], cwd, {
    SCREENSHOT_LABEL: label,
  })
}

function captureBefore() {
  run("git", ["fetch", "origin", "main"], root)
  const worktree = resolve(
    root,
    ".agents/worktrees",
    `before-${basename(spec, ".spec.ts")}`,
  )
  if (existsSync(worktree)) {
    run("git", ["worktree", "remove", "--force", worktree], root)
  }
  run("git", ["worktree", "add", "--detach", worktree, "origin/main"], root)
  try {
    run("npm", ["install"], worktree)
    // origin/main may not have the screenshot helper yet, so copy it along with the spec.
    for (const file of [spec, HELPER]) {
      mkdirSync(dirname(join(worktree, file)), { recursive: true })
      cpSync(join(root, file), join(worktree, file))
    }
    runSpec(worktree, "before")
    mkdirSync(join(root, OUT_DIR), { recursive: true })
    for (const file of readdirSync(join(worktree, OUT_DIR))) {
      if (file.endsWith(".png")) {
        cpSync(join(worktree, OUT_DIR, file), join(root, OUT_DIR, file))
      }
    }
  } finally {
    run("git", ["worktree", "remove", "--force", worktree], root)
  }
}

// The two runs share the e2e tier's fixed ports, so they go one after the other.
// "after" goes first: the tier's globalSetup wipes test-results/, which would delete copied "before" images.
runSpec(root, values.before ? "after" : undefined)
if (values.before) captureBefore()

for (const file of readdirSync(join(root, OUT_DIR)).sort()) {
  if (file.endsWith(".png")) console.log(`${OUT_DIR}/${file}`)
}
