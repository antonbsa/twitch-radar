import { ApiError } from "../../http/errors"
import { logger, serializeError } from "../../lib/logger"

// Twitch error bodies are always small JSON in practice; this is a safety
// cap so a pathological response can't blow up a log record, not an
// expected path.
const MAX_ERROR_BODY_LENGTH = 2000

export async function readErrorBody(res: Response): Promise<string> {
  const text = await res.text().catch(() => "")
  return text.slice(0, MAX_ERROR_BODY_LENGTH)
}

export class TwitchApiError extends Error {
  readonly status: number
  readonly body: string
  /** `Retry-After` seconds when Twitch sent a numeric one, else `null`. */
  readonly retryAfter: string | null
  constructor(
    message: string,
    status: number,
    body: string,
    retryAfter: string | null = null,
  ) {
    super(message)
    this.name = "TwitchApiError"
    this.status = status
    this.body = body
    this.retryAfter = retryAfter
  }
}

/** Builds the error for a non-OK Twitch response, keeping status, body and `Retry-After`. */
export async function twitchApiErrorFromResponse(
  message: string,
  res: Response,
): Promise<TwitchApiError> {
  const retryAfter = res.headers.get("Retry-After")
  return new TwitchApiError(
    message,
    res.status,
    await readErrorBody(res),
    retryAfter && /^\d+$/.test(retryAfter) ? retryAfter : null,
  )
}

/**
 * Maps a transient upstream failure to the error the client should see: 429
 * becomes `503 twitch_unavailable` (forwarding `Retry-After` when Twitch sent
 * one), 5xx becomes `502 twitch_unavailable`. Anything else, including a 401
 * (which callers own: it means the token is dead, not that Twitch is down), is
 * returned unchanged so it still reaches `app.onError` as the bug it is.
 */
export function classifyTwitchError(err: unknown): unknown {
  if (!(err instanceof TwitchApiError)) return err
  if (err.status !== 429 && err.status < 500) return err

  logger.warn("Twitch unavailable", { ...serializeError(err) })
  if (err.status === 429) {
    return new ApiError(
      503,
      "twitch_unavailable",
      "Twitch is rate limiting requests, try again shortly",
      err.retryAfter ? { "Retry-After": err.retryAfter } : {},
    )
  }
  return new ApiError(
    502,
    "twitch_unavailable",
    "Twitch is unavailable, try again shortly",
  )
}
