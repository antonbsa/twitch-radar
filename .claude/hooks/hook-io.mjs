import { readFileSync } from "node:fs"

/** Parses the PreToolUse payload Claude Code writes to stdin. */
export function readHookInput() {
  return JSON.parse(readFileSync(0, "utf8"))
}

/**
 * Prints a PreToolUse decision and exits. Staying silent (no call) leaves the normal permission flow in charge.
 * @param {"deny" | "ask"} decision
 */
export function decide(decision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: reason,
      },
    }),
  )
  process.exit(0)
}
