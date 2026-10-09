// Uploads images to the `pr-assets` branch through the GitHub contents API and prints one Markdown line per image for a PR body.
// Usage: npm run pr:image -- <file>... [--dir <dir>]
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { basename, extname } from "node:path"
import { parseArgs } from "node:util"

const BRANCH = "pr-assets"
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

const repo = run("gh", [
  "repo",
  "view",
  "--json",
  "nameWithOwner",
  "--jq",
  ".nameWithOwner",
])

if (ghApi([`repos/${repo}/branches/${BRANCH}`]) === null) {
  fail(
    `Branch "${BRANCH}" does not exist. Create it once with "One-time setup: pr-assets branch" in .claude/skills/capturing-ui-screenshots/SKILL.md.`,
  )
}

// One at a time: parallel commits to the same branch conflict.
for (const file of files) {
  const name = basename(file)
  const encodedPath = `${dir}/${name}`
    .split("/")
    .map(encodeURIComponent)
    .join("/")
  const endpoint = `repos/${repo}/contents/${encodedPath}`

  // A PUT over an existing file must carry its current blob sha.
  const existingSha = ghApi([`${endpoint}?ref=${BRANCH}`, "--jq", ".sha"])

  const body = {
    message: `chore: add ${dir}/${name}`,
    content: readFileSync(file).toString("base64"),
    branch: BRANCH,
    ...(existingSha ? { sha: existingSha } : {}),
  }

  // The payload goes through stdin: a base64 PNG exceeds the argument-length limit.
  const response = JSON.parse(
    run(
      "gh",
      ["api", "-X", "PUT", endpoint, "--input", "-"],
      JSON.stringify(body),
    ),
  )

  // Pinned to the commit SHA so re-uploading the same name doesn't change earlier PR descriptions.
  const stem = basename(name, extname(name))
  console.log(
    `![${stem}](https://raw.githubusercontent.com/${repo}/${response.commit.sha}/${encodedPath})`,
  )
}
