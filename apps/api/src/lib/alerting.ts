import { AsyncLocalStorage } from "node:async_hooks"
import * as Sentry from "@sentry/cloudflare"
import type { AppConfig, Env } from "../env"
import { logger } from "./logger"

// Slack's incoming webhooks answer in well under a second; this only bounds
// how long a dead endpoint can hold a scheduled or queue invocation open.
const SLACK_TIMEOUT_MS = 3000
const MAX_LISTED_FAILURES = 10

interface Failure {
  source: string
  error: unknown
}

// Per-invocation failure buffer (ADR 0047): a scheduled job or queue batch
// logs every failing item but reports once, so a permanently-failing row can't
// turn into one Sentry event per row per minute.
const failureBuffer = new AsyncLocalStorage<Failure[]>()

let alertConfig: Pick<AppConfig, "environment" | "slackAlertWebhookUrl"> = {
  environment: "local",
  slackAlertWebhookUrl: undefined,
}

/** Call next to `logger.configure` at each entry point. */
export function configureAlerting(config: AppConfig): void {
  alertConfig = config
}

/**
 * Options for `Sentry.withSentry`. Reads the raw binding, not `parseEnv`, so a
 * malformed env can't throw inside the SDK wrapper; `local` and an unset DSN
 * both leave the SDK disabled.
 */
export function sentryOptions(env: Env): Sentry.CloudflareOptions {
  const environment = env.ENVIRONMENT ?? "local"
  return {
    dsn: environment === "local" ? undefined : env.SENTRY_DSN,
    environment,
  }
}

/**
 * Reports a caught failure. Inside `collectFailures` it is buffered into that
 * invocation's single report; outside one (request path) it is sent at once.
 * Never throws.
 */
export function recordFailure(source: string, error: unknown): void {
  const buffer = failureBuffer.getStore()
  if (buffer) buffer.push({ source, error })
  else sendReport([{ source, error }]).catch(() => {})
}

/**
 * Like `recordFailure` for a request handler: the caller keeps the returned
 * promise alive past the response with `executionCtx.waitUntil`.
 */
export function reportFailure(source: string, error: unknown): Promise<void> {
  return sendReport([{ source, error }])
}

/**
 * Runs one scheduled or queue invocation and sends a single aggregated report
 * for every `recordFailure` made inside it, after the work is done.
 */
export async function collectFailures<T>(fn: () => Promise<T>): Promise<T> {
  const failures: Failure[] = []
  try {
    return await failureBuffer.run(failures, fn)
  } finally {
    if (failures.length > 0) await sendReport(failures)
  }
}

async function sendReport(failures: Failure[]): Promise<void> {
  try {
    const [first] = failures
    if (!first || alertConfig.environment === "local") return

    Sentry.withScope((scope) => {
      scope.setTag("source", first.source)
      scope.setExtra("failureCount", failures.length)
      scope.setExtra("failures", summarize(failures))
      Sentry.captureException(first.error)
    })

    await sendSlackAlert(failures)
  } catch (error) {
    // A broken alert path must never fail the work it reports on.
    logger.warn("Failure report could not be sent", {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function summarize(failures: Failure[]): string[] {
  return failures
    .slice(0, MAX_LISTED_FAILURES)
    .map((f) => `${f.source}: ${errorMessage(f.error)}`)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function sendSlackAlert(failures: Failure[]): Promise<void> {
  // Who gets paged is decided by which environments hold the webhook secret
  // (production only, ADR 0047); preview records to Sentry without it.
  const url = alertConfig.slackAlertWebhookUrl
  if (!url) return
  const [first] = failures
  if (!first) return

  const more =
    failures.length > 1 ? ` (+${failures.length - 1} more this invocation)` : ""
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: `:rotating_light: [${alertConfig.environment}] ${first.source}: ${errorMessage(first.error)}${more}`,
    }),
    signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
  })
}
