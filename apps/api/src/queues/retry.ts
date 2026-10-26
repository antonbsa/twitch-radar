const BASE_DELAY_SECONDS = 15
const MAX_DELAY_SECONDS = 300

/**
 * Exponential backoff for `message.retry()`: 15s, 30s, 60s, ... capped at 5
 * minutes, so `max_retries` outlasts a transient D1 outage instead of being
 * spent in seconds. `attempts` starts at 1 on the first delivery.
 */
export function retryDelaySeconds(attempts: number): number {
  return Math.min(BASE_DELAY_SECONDS * 2 ** (attempts - 1), MAX_DELAY_SECONDS)
}
