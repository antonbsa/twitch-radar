/**
 * Runs `npx wrangler <args>`, retrying with exponential backoff when the
 * failure looks like a transient Cloudflare-side blip (network error, 5xx,
 * malformed response) rather than a real application error. See issue #71 -
 * wrangler calls the Cloudflare API directly and occasionally hits a
 * proxy-level reset unrelated to secrets/config/code correctness, which
 * would otherwise fail an entire deploy job that a human has to notice and
 * manually re-run.
 *
 * Any deploy script that shells out to wrangler (`secret list`,
 * `d1 migrations apply`, `deploy`, ...) can reuse this instead of calling
 * `spawnSync` directly.
 */

import { spawnSync } from "node:child_process"

const DEFAULT_MAX_ATTEMPTS = 4
const DEFAULT_BASE_DELAY_MS = 1000

// Matches the class of failure observed in CI: a proxy-level reset or 5xx
// from Cloudflare's edge, not an application error response. Deliberately
// narrow - a non-transient failure (bad args, auth failure, a genuinely
// missing secret) must fail immediately, not burn through retries.
const TRANSIENT_PATTERNS = [
  /\b5\d{2}\b/,
  /malformed response/i,
  /upstream connect error/i,
  /disconnect\/reset before headers/i,
  /ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN/,
  /network error/i,
]

function isTransientFailure(output) {
  return TRANSIENT_PATTERNS.some((pattern) => pattern.test(output))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * @param {string[]} args - argv passed to `npx wrangler`, e.g. ["secret", "list", "--env", "preview"].
 * @param {{
 *   cwd: string,
 *   maxAttempts?: number,
 *   baseDelayMs?: number,
 *   isTransient?: (combinedOutput: string) => boolean,
 * }} options
 * @returns {Promise<import("node:child_process").SpawnSyncReturns<string>>} the result of the last attempt made.
 */
export async function runWranglerWithRetry(
  args,
  {
    cwd,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    isTransient = isTransientFailure,
  } = {},
) {
  let result
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    result = spawnSync("npx", ["wrangler", ...args], { cwd, encoding: "utf-8" })

    const succeeded = result.status === 0 && !result.error
    if (succeeded) return result

    const output = [result.stdout, result.stderr, result.error?.message]
      .filter(Boolean)
      .join("\n")

    if (!isTransient(output) || attempt === maxAttempts) return result

    const delayMs = baseDelayMs * 2 ** (attempt - 1)
    console.warn(
      `wrangler ${args.join(" ")} failed with a transient error (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms...`,
    )
    await sleep(delayMs)
  }
  return result
}
