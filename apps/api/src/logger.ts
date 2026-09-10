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
  private environment: AppConfig["environment"] = "local"

  /**
   * Sets the minimum emitted log level from the app's configured environment.
   * Call once per request/queue-message/scheduled invocation right after
   * `parseEnv` — environment never changes within a deployment, so repeated
   * calls are idempotent in practice; it's cheap enough not to bother
   * memoizing further.
   */
  configure(environment: AppConfig["environment"]): void {
    this.environment = environment
    this.minLevel = ENVIRONMENT_MIN_LEVEL[environment]
  }

  debug(message: string, fields?: Record<string, unknown>): void {
    // console.debug specifically (unlike log/info/warn/error) isn't forwarded
    // to the terminal by wrangler dev's inspector relay, local or --remote
    this.emit("debug", console.log, message, fields)
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
    const record = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...fields,
    }
    consoleMethod(
      this.environment === "local"
        ? formatForTerminal(record)
        : JSON.stringify(record),
    )
  }
}

export const logger = new Logger()

// Human-readable rendering for `environment === "local"` only. real newlines
// instead of a single JSON line with escaped `\n`. preview/prod keep JSON,
// which Workers Logs relies on for field extraction (ADR 0040)
function formatForTerminal(record: Record<string, unknown>): string {
  const { level, message, timestamp, ...fields } = record
  const lines = [
    `[${String(level).toUpperCase()}] ${String(message)}`,
    `  timestamp: ${String(timestamp)}`,
  ]
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string" && value.includes("\n")) {
      lines.push(`  ${key}:`, ...value.split("\n").map((line) => `    ${line}`))
    } else {
      lines.push(
        `  ${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
      )
    }
  }
  return lines.join("\n")
}

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
  body?: string
}

/**
 * Shared shape for logging a caught error, used at every catch-site log call
 * instead of the lossy `error instanceof Error ? error.message : String(error)`
 * inline pattern — that pattern drops `stack`/`cause` and any extra fields
 * (e.g. `TwitchApiError.status`/`.body`) the thrown value carries.
 *
 * Deliberately checks for `status`/`code`/`body` via `in` rather than
 * importing `TwitchApiError` — keeps this module free of a dependency on the
 * Twitch client and also picks up these fields from any other error shape
 * the app introduces later.
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
    if ("body" in err) {
      result.body = String((err as Record<string, unknown>).body).slice(
        0,
        MAX_SERIALIZED_FIELD_LENGTH,
      )
    }
  }
  return result
}
