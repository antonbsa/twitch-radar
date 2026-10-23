// Uploads images to `assets/` on main of the `<repo>-ci-reports` repo through the GitHub contents API and prints one Markdown line per image for a PR body (ADR 0060).
// Usage: npm run pr:image -- <file>... [--dir <dir>]
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { basename, extname } from "node:path"
import { parseArgs } from "node:util"

const BRANCH = "main"
const EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"])

/** Fails with a message on stderr; stdout stays reserved for the Markdown lines. */
function fail(message) {
  console.error(message)
  process.exit(1)
}

function run(command, args, input) {
  return execFileSync(command, args, {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim()
}

/** Returns the stdout of a `gh api` call, or null on 404. */
function ghApi(args, input) {
  try {
    return run("gh", ["api", ...args], input)
  } catch (error) {
    if (/HTTP 404|Not Found/.test(String(error.stderr))) return null
    throw error
  }
}

const { values, positionals: files } = parseArgs({
  allowPositionals: true,
  options: { dir: { type: "string" } },
})
if (files.length === 0) {
  fail("Usage: npm run pr:image -- <file>... [--dir <dir>]")
}

for (const file of files) {
  if (!EXTENSIONS.has(extname(file).toLowerCase())) {
    fail(
      `Unsupported extension "${extname(file)}" in ${file}. Allowed: ${[...EXTENSIONS].join(", ")}`,
    )
  }
}

const dir = values.dir ?? run("git", ["rev-parse", "--abbrev-ref", "HEAD"])
if (dir === "main" || dir === "HEAD") {
  fail(
    `Refusing to use "${dir}" as the target directory. Run from a feature branch or pass --dir.`,
  )
}

// Same derivation as ci-reports.mjs, so a clone uploads to its own reports repo.
const repo = `${run("gh", [
  "repo",
  "view",
  "--json",
  "nameWithOwner",
  "--jq",
  ".nameWithOwner",
])}-ci-reports`

if (ghApi([`repos/${repo}/branches/${BRANCH}`]) === null) {
  fail(
    `Repo "${repo}" has no "${BRANCH}" branch. Set it up with "CI Test Reports Repo" in docs/operations/environment-setup.md.`,
  )
}

// One at a time: parallel commits to the same branch conflict.
for (const file of files) {
  const name = basename(file)
  const encodedPath = `assets/${dir}/${name}`
    .split("/")
    .map(encodeURIComponent)
    .join("/")
  const endpoint = `repos/${repo}/contents/${encodedPath}`

  // A PUT over an existing file must carry its current blob sha.
  const existingSha = ghApi([`${endpoint}?ref=${BRANCH}`, "--jq", ".sha"])

  const body = {
    message: `chore: add assets/${dir}/${name}`,
    content: readFileSync(file).toString("base64"),
    branch: BRANCH,
    ...(existingSha ? { sha: existingSha } : {}),
  }

  // The payload goes through stdin: a base64 PNG exceeds the argument-length limit.
  run(
    "gh",
    ["api", "-X", "PUT", endpoint, "--input", "-"],
    JSON.stringify(body),
  )

  // Not pinned to a commit: ci-reports.mjs rewrites main as an orphan commit, so old SHAs stop resolving. Re-uploading the same name replaces the image in earlier PR descriptions.
  const stem = basename(name, extname(name))
  console.log(
    `![${stem}](https://raw.githubusercontent.com/${repo}/${BRANCH}/${encodedPath})`,
  )
}
