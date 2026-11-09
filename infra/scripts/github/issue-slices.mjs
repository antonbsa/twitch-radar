// Records and reads an issue split through GitHub's native sub-issues and "blocked by" dependencies (implement skill).
// Usage:
//   npm run issues:slices -- link <parent> <slice> [--blocked-by <number>]...
//   npm run issues:slices -- ready <parent>
// `ready` prints JSON: the parent's open sub-issues, split into `ready` (no open blocker) and `blocked`.
import { execFileSync } from "node:child_process"
import { parseArgs } from "node:util"

/** Fails with a message on stderr; stdout stays reserved for the result. */
function fail(message) {
  console.error(message)
  process.exit(1)
}

/** `{owner}/{repo}` is filled in by gh from the current checkout's remote. */
function ghApi(...args) {
  return JSON.parse(
    execFileSync("gh", ["api", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", 2],
    }),
  )
}

function issueNumber(value) {
  if (!/^\d+$/.test(value ?? "")) fail(`"${value}" is not an issue number.`)
  return Number(value)
}

/** Both APIs want the issue's numeric REST `id`, not its number or the GraphQL node id. */
function issueId(number) {
  return String(ghApi(`repos/{owner}/{repo}/issues/${number}`).id)
}

/** Every page of a list endpoint, flattened. */
function list(path) {
  return ghApi("--paginate", "--slurp", `${path}?per_page=100`).flat()
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { "blocked-by": { type: "string", multiple: true, default: [] } },
})
const [command, ...rest] = positionals

if (command === "link" && rest.length === 2) {
  const [parent, slice] = rest.map(issueNumber)
  const blockers = values["blocked-by"].map(issueNumber)
  ghApi(
    "--method",
    "POST",
    `repos/{owner}/{repo}/issues/${parent}/sub_issues`,
    "-F",
    `sub_issue_id=${issueId(slice)}`,
  )
  for (const blocker of blockers) {
    ghApi(
      "--method",
      "POST",
      `repos/{owner}/{repo}/issues/${slice}/dependencies/blocked_by`,
      "-F",
      `issue_id=${issueId(blocker)}`,
    )
  }
  console.error(
    `#${slice} is a sub-issue of #${parent}${blockers.length ? `, blocked by ${blockers.map((n) => `#${n}`).join(", ")}` : ""}.`,
  )
} else if (
  command === "ready" &&
  rest.length === 1 &&
  values["blocked-by"].length === 0
) {
  const parent = issueNumber(rest[0])
  const open = list(`repos/{owner}/{repo}/issues/${parent}/sub_issues`).filter(
    (issue) => issue.state === "open",
  )
  const ready = []
  const blocked = []
  for (const issue of open) {
    const blockedBy = list(
      `repos/{owner}/{repo}/issues/${issue.number}/dependencies/blocked_by`,
    )
      .filter((blocker) => blocker.state === "open")
      .map((blocker) => blocker.number)
    const entry = { number: issue.number, title: issue.title }
    if (blockedBy.length) blocked.push({ ...entry, blockedBy })
    else ready.push(entry)
  }
  console.log(JSON.stringify({ parent, ready, blocked }, null, 2))
} else {
  fail(
    "Usage:\n  npm run issues:slices -- link <parent> <slice> [--blocked-by <number>]...\n  npm run issues:slices -- ready <parent>",
  )
}
