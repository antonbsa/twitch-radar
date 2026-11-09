// PreToolUse guard for Bash: turns AGENTS.md rules that prose alone can't enforce into hard checks. They must hold in bypassPermissions mode too, where `ask` rules in settings.json never prompt.
import { decide, readHookInput } from "./hook-io.mjs"

const input = readHookInput()
const command = input.tool_input?.command ?? ""

/** Splits a shell command into simple commands. Naive about quoting, which only makes the checks stricter. */
function segments(cmd) {
  return cmd
    .split(/&&|\|\||[;|\n]/)
    .map((part) => part.trim().split(/\s+/).map(unquote).filter(Boolean))
    .filter((tokens) => tokens.length > 0)
}

function unquote(token) {
  return token.replace(/^['"]+|['"]+$/g, "")
}

/** Drops `sudo`, `env` and leading `VAR=value` assignments so tokens[0] is the program. */
function program(tokens) {
  let i = 0
  while (i < tokens.length && (tokens[i] === "sudo" || tokens[i] === "env" || /^\w+=/.test(tokens[i]))) i++
  return tokens.slice(i)
}

// Release: publishing a GitHub release is the production deploy (ADR 0041); the release skill only ever creates drafts.
if (/\bgh\s+release\s+create\b/.test(command) && !/--draft\b(?!=false)/.test(command)) {
  decide("deny", "`gh release create` must pass `--draft`: publishing a release deploys production (ADR 0041). Publishing stays a human action.")
}
if (/\bgh\s+release\s+edit\b/.test(command) && /--draft(=|\s+)false\b/.test(command)) {
  decide("deny", "Publishing a draft release deploys production (ADR 0041) and stays a human action.")
}
if (/\bgh\s+api\b/.test(command) && /releases/.test(command) && /draft\W+false/.test(command)) {
  decide("deny", "Publishing a draft release deploys production (ADR 0041) and stays a human action.")
}

// Root .env.local / .env.production hold real secrets that exist nowhere else (AGENTS.md "Env Vars").
// Only the command text is checked, so scripts that write them through fs (`npm run dev:mobile` sets PUBLIC_URL in .env.local) keep working.
const SECRET_ENV = /(^|[/=])\.env\.(local|production)$/
const isSecretEnv = (token) => SECRET_ENV.test(token)
const ENV_DENY = "Writing, moving or deleting .env.local/.env.production is blocked: they hold real secrets that exist nowhere else (AGENTS.md \"Env Vars\"). Stop and ask the user to make this change."

if (/>\|?\s*['"]?[^\s'"]*\.env\.(local|production)(?=$|[\s'";|&)])/.test(command)) decide("deny", ENV_DENY)
for (const raw of segments(command)) {
  const [bin, ...args] = program(raw)
  const name = bin?.split("/").pop()
  const operands = args.filter((arg) => !arg.startsWith("-"))
  const writes =
    (["tee", "rm", "unlink", "truncate", "shred", "mv"].includes(name) && args.some(isSecretEnv)) ||
    (["sed", "perl"].includes(name) && args.some((arg) => /^(-\w*i|--in-place)/.test(arg)) && args.some(isSecretEnv)) ||
    (["cp", "install", "ln", "rsync"].includes(name) && isSecretEnv(operands.at(-1) ?? "")) ||
    (name === "dd" && args.some((arg) => arg.startsWith("of=") && isSecretEnv(arg)))
  if (writes) decide("deny", ENV_DENY)
}

// Worktree paths stay fixed for life: Orca tracks each worktree and its chat session by path (AGENTS.md "Worktrees and `.agents/`").
const WORKTREE_DENY = "Keep the worktree at its path: Orca tracks worktrees (and their chat sessions) by path, so moving one breaks the session (AGENTS.md \"Worktrees and `.agents/`\"). Renaming the branch with `git branch -m` is fine. Ask the user if a move is really needed."
for (const raw of segments(command)) {
  const [bin, ...args] = program(raw)
  const name = bin?.split("/").pop()
  // Skips `-C <dir>`/`-c <key=value>` so `git -C <dir> worktree move` matches too.
  const sub = args.filter((arg, i) => !arg.startsWith("-") && !["-C", "-c"].includes(args[i - 1]))
  const movesWorktree =
    (name === "git" && sub[0] === "worktree" && sub[1] === "move") ||
    (name === "mv" && args.some((arg) => /\.agents\/worktrees\/[^/\s]/.test(arg)))
  if (movesWorktree) decide("deny", WORKTREE_DENY)
}

// Local D1: anything beyond a single read needs the user's yes every time (apps/api/AGENTS.md "D1 debug queries").
if (/\bd1\s+execute\b/.test(command)) {
  const sql = command.match(/--command(?:=|\s+)(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+))/)
  const query = (sql?.[1] ?? sql?.[2] ?? sql?.[3] ?? "").trim()
  const singleSelect = /^select\b/i.test(query) && !/;\s*\S/.test(query)
  if (!singleSelect) {
    decide("ask", "This d1 execute may mutate data or schema (not a single SELECT). Confirm what it changes and which database it targets.")
  }
}
if (segments(command).some((raw) => {
  const [bin, ...args] = program(raw)
  return bin === "rm" && args.some((arg) => /(^|\/)\.wrangler(\/state(\/|$)|\/?$)/.test(arg))
})) {
  decide("ask", "Deleting .wrangler state wipes the local D1/KV (sessions, synced channels). Confirm before running.")
}

// implementer subagents leave their work uncommitted: staging and history stay with the user (implement skill).
const HISTORY = new Set(["add", "commit", "push", "reset", "restore", "stash", "rebase", "merge", "cherry-pick", "revert", "tag", "am"])
if (input.agent_type === "implementer" && segments(command).some((raw) => {
  const [bin, ...args] = program(raw)
  const sub = args.filter((arg, i) => !arg.startsWith("-") && !["-C", "-c"].includes(args[i - 1]))
  return bin?.split("/").pop() === "git" && HISTORY.has(sub[0])
})) {
  decide("deny", "An implementer leaves its work uncommitted: staging and history belong to the user (implement skill). Report your changes instead.")
}
