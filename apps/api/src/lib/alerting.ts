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

// Known Cloudflare platform blips, matched on lowercase message substrings
// anywhere in the `cause` chain (https://developers.cloudflare.com/d1/observability/debug-d1/).
// Order matters: the queue pattern must precede the generic "overloaded" one.
const TRANSIENT_PATTERNS: Array<[kind: string, needles: string[]]> = [
  ["queue-overloaded", ["(10250)", "queue is overloaded"]],
  ["d1-overloaded", ["d1 db is overloaded", "requests queued for too long"]],
  ["network-connection-lost", ["network connection lost"]],
  [
    "d1-internal-error",
    [
      "d1_error: internal error",
      "storage caused object to be reset",
      "reset because its code was updated",
    ],
  ],
]

const MAX_CAUSE_DEPTH = 5

function causeChain(error: unknown): unknown[] {
  const chain: unknown[] = []
  let current = error
  while (chain.length < MAX_CAUSE_DEPTH && current != null) {
    chain.push(current)
    current = current instanceof Error ? current.cause : undefined
  }
  return chain
}

/** The transient platform error kind an error (or any of its causes) is, if any. */
export function transientKind(error: unknown): string | undefined {
  for (const link of causeChain(error)) {
    const message = errorMessage(link).toLowerCase()
    const match = TRANSIENT_PATTERNS.find(([, needles]) =>
      needles.some((needle) => message.includes(needle)),
    )
    if (match) return match[0]
  }
  return undefined
}

/**
 * Drizzle wraps a D1 failure as `Error("Failed query: <sql>")` with the real
 * error in `cause`; Sentry should title and group the issue by the cause.
 */
function unwrapDrizzle(error: unknown): { error: unknown; query?: string } {
  if (
    error instanceof Error &&
    error.message.startsWith("Failed query:") &&
    error.cause instanceof Error
  ) {
    return { error: error.cause, query: error.message }
  }
  return { error }
}

// Drops volatile parts (`reference = <id>`) so one failure mode is one issue.
function stableMessage(error: unknown): string {
  return errorMessage(error).replace(/;?\s*reference\s*=\s*\S+/i, "")
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

interface ScheduledInvocation {
  controller: ScheduledController
  env: Env
  ctx: ExecutionContext
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
 * for every `recordFailure` made inside it, after the work is done. Pass
 * `cron` for a `scheduled` invocation that is not wrapped by `withSentry`, so
 * its Sentry client is only built when there is a failure to report.
 * `fn` must catch its own errors, as `runScheduled` does: nothing here captures a throw.
 */
export async function collectFailures<T>(
  fn: () => Promise<T>,
  cron?: ScheduledInvocation,
): Promise<T> {
  const failures: Failure[] = []
  try {
    return await failureBuffer.run(failures, fn)
  } finally {
    if (failures.length > 0) await sendReport(failures, cron)
  }
}

async function sendReport(
  failures: Failure[],
  cron?: ScheduledInvocation,
): Promise<void> {
  try {
    const [first] = failures
    if (!first || alertConfig.environment === "local") return

    // A blip is a warning with one stable issue per kind and no Slack page; a
    // Sentry alert rule on `transient:true` notifies on frequency (ADR 0047).
    const kinds = failures.map((f) => transientKind(f.error))
    const transient = kinds.every((kind) => kind !== undefined)

    const capture = () =>
      Sentry.withScope((scope) => {
        const { error, query } = unwrapDrizzle(first.error)
        scope.setTag("source", first.source)
        scope.setExtra("failureCount", failures.length)
        scope.setExtra("failures", summarize(failures))
        if (query) scope.setExtra("query", query)
        if (transient) {
          scope.setLevel("warning")
          scope.setTag("transient", true)
          scope.setFingerprint(["transient-platform-error", kinds[0]!])
        } else if (query) {
          scope.setFingerprint(["d1-query-failed", stableMessage(error)])
        }
        Sentry.captureException(error)
      })
    if (cron) {
      // `scheduled` skips the main `withSentry` (its per-invocation setup busts the
      // Free plan's 10ms cron CPU), so a client is built here only on failure.
      const handler: ExportedHandler<Env> = { scheduled: capture }
      const reporter = Sentry.withSentry(sentryOptions, handler)
      await reporter.scheduled?.(cron.controller, cron.env, cron.ctx)
    } else {
      capture()
    }

    if (!transient) await sendSlackAlert(failures)
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
