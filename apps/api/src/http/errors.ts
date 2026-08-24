import { logger, serializeError } from "../logger"
import { jsonResponse } from "./response"

export interface ErrorBody {
  error: {
    code: string
    message: string
    requestId: string
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }
}

export function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof ApiError) {
    return jsonResponse(
      {
        error: {
          code: error.code,
          message: error.message,
          requestId,
        },
      } satisfies ErrorBody,
      { status: error.status },
    )
  }

  if (isMissingLocalD1SchemaError(error)) {
    logger.error(
      "Unhandled error: local D1 database is missing tables - run 'npm run db:setup' in apps/api to apply migrations (see README setup steps)",
      { ...serializeError(error) },
    )
  } else {
    logger.error("Unhandled error", { ...serializeError(error) })
  }

  return jsonResponse(
    {
      error: {
        code: "internal_error",
        message: "Internal server error",
        requestId,
      },
    } satisfies ErrorBody,
    { status: 500 },
  )
}

// Detects an unmigrated local D1 (e.g. a fresh worktree) so the log can
// point at `npm run db:setup` instead of SQLite's generic "no such table".
function isMissingLocalD1SchemaError(error: unknown): boolean {
  if (!(error instanceof Error) || error.cause === undefined) return false
  const causeMessage =
    error.cause instanceof Error ? error.cause.message : String(error.cause)
  return /no such table/i.test(causeMessage)
}
