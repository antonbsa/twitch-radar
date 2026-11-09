// Creates `.agents/worktrees/<branch>` in the main checkout, off the latest origin/main, with dependencies installed (AGENTS.md "Worktrees and `.agents/`").
// Usage: npm run worktree:create -- <branch>
// Prints the worktree's absolute path as the last stdout line; git and npm output goes to stderr.
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"

/** Fails with a message on stderr. */
function fail(message) {
  console.error(message)
  process.exit(1)
}

function git(...args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", 2],
  }).trim()
}

const [branch, ...extra] = process.argv.slice(2)
if (!branch || extra.length > 0)
  fail("Usage: npm run worktree:create -- <branch>")
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(branch))
  fail(
    `"${branch}" is not kebab-case. Name the branch after the work, e.g. oauth-cancel-callback.`,
  )
if (/^(issue|agent)-/.test(branch))
  fail(
    `"${branch}" starts with a generic prefix. Name the branch after the work, not the issue or agent.`,
  )

// The common dir is the main checkout's .git, so worktrees land in one place even when this runs from inside another worktree.
const root = dirname(
  git("rev-parse", "--path-format=absolute", "--git-common-dir"),
)
const path = join(root, ".agents", "worktrees", branch)
if (existsSync(path))
  fail(
    `${path} already exists. Pick another branch name, or reuse that worktree if it holds this work.`,
  )
const branchExists =
  execFileSync("git", ["-C", root, "branch", "--list", branch], {
    encoding: "utf8",
  }).trim() !== ""
if (branchExists) fail(`Branch "${branch}" already exists. Pick another name.`)

git("-C", root, "fetch", "origin", "main")
git(
  "-C",
  root,
  "worktree",
  "add",
  "--no-track",
  "-b",
  branch,
  path,
  "origin/main",
)
execFileSync("npm", ["install"], { cwd: path, stdio: ["ignore", 2, 2] })
// Without it, typecheck in the worktree fails with TS2688 on @cloudflare/workers-types.
if (!existsSync(join(path, "node_modules", ".bin", "tsc")))
  fail(`npm install finished but ${path}/node_modules/.bin/tsc is missing.`)

console.log(path)
