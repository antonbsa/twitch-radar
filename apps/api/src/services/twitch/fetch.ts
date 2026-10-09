import { TwitchApiError } from "./errors"

// Twitch normally answers in well under a second; without a cap a hung
// connection holds a cron invocation (or request) until the platform kills it.
const TWITCH_REQUEST_TIMEOUT_MS = 10_000

/**
 * `fetch` for every Twitch call: gives up after 10s and reports the timeout
 * as a `504 TwitchApiError`, so callers treat it like any other transient
 * upstream failure (never a dead token).
 */
export async function fetchTwitch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TWITCH_REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new TwitchApiError(
        `Twitch request timed out after ${TWITCH_REQUEST_TIMEOUT_MS}ms`,
        504,
        "",
      )
    }
    throw err
  }
}
