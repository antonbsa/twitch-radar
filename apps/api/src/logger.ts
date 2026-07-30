import type { AppConfig } from "./env"

export type LogLevel = "debug" | "info" | "warn" | "error"

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

// local/preview: full detail (local dev, and preview is a low-traffic
// verification environment where noise is cheap). production: skip
// debug-level chatter, keep info/warn/error.
const ENVIRONMENT_MIN_LEVEL: Record<AppConfig["environment"], LogLevel> = {
  local: "debug",
  preview: "debug",
  production: "info",
}

class Logger {
  private minLevel: LogLevel = ENVIRONMENT_MIN_LEVEL.local

  /**
   * Sets the minimum emitted log level from the app's configured environment.
   * Call once per request/queue-message/scheduled invocation right after
   * `parseEnv` — environment never changes within a deployment, so repeated
   * calls are idempotent in practice; it's cheap enough not to bother
   * memoizing further.
   */
  configure(environment: AppConfig["environment"]): void {
    this.minLevel = ENVIRONMENT_MIN_LEVEL[environment]
  }

  debug(message: string, fields?: Record<string, unknown>): void {
    this.emit("debug", console.debug, message, fields)
  }

  info(message: string, fields?: Record<string, unknown>): void {
    this.emit("info", console.log, message, fields)
  }

  warn(message: string, fields?: Record<string, unknown>): void {
    this.emit("warn", console.warn, message, fields)
  }

  error(message: string, fields?: Record<string, unknown>): void {
    this.emit("error", console.error, message, fields)
  }

  private emit(
    level: LogLevel,
    consoleMethod: (...args: unknown[]) => void,
    message: string,
    fields?: Record<string, unknown>,
  ): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.minLevel]) return
    consoleMethod(
      JSON.stringify({
        level,
        message,
        timestamp: new Date().toISOString(),
        ...fields,
      }),
    )
  }
}

export const logger = new Logger()

// Twitch/push error bodies are always small JSON in practice — this is a
// safety cap against a pathological response blowing up log record size,
// not an expected path.
const MAX_SERIALIZED_FIELD_LENGTH = 2000

export interface SerializedError {
  error: string
  stack?: string
  cause?: string
  status?: unknown
  code?: unknown
}

/**
 * Shared shape for logging a caught error, used at every catch-site log call
 * instead of the lossy `error instanceof Error ? error.message : String(error)`
 * inline pattern — that pattern drops `stack`/`cause` and any extra fields
 * (e.g. `TwitchApiError.status`) the thrown value carries.
 *
 * Deliberately checks for `status`/`code` via `in` rather than importing
 * `TwitchApiError` — keeps this module free of a dependency on the Twitch
 * client and also picks up `status`/`code` from any other error shape the
 * app introduces later.
 */
export function serializeError(err: unknown): SerializedError {
  const result: SerializedError = {
    error: err instanceof Error ? err.message : String(err),
  }
  if (err instanceof Error && err.stack) {
    result.stack = err.stack.slice(0, MAX_SERIALIZED_FIELD_LENGTH)
  }
  if (err instanceof Error && err.cause !== undefined) {
    result.cause = String(err.cause).slice(0, MAX_SERIALIZED_FIELD_LENGTH)
  }
  if (typeof err === "object" && err !== null) {
    if ("status" in err) result.status = (err as Record<string, unknown>).status
    if ("code" in err) result.code = (err as Record<string, unknown>).code
  }
  return result
}
