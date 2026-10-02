// Cron expressions must match wrangler.jsonc's `triggers.crons` exactly —
// `controller.cron` is the raw matched expression the scheduled() handler
// dispatches on (ADR 0036). Kept in their own module so tests can address a
// specific job through `/__scheduled?cron=...` without importing the worker.
// `scheduled()` still reaches CRON_MINUTELY's jobs through its `default`
// branch, so a bare `/__scheduled` (no cron) runs them too.
export const CRON_MINUTELY = "* * * * *"
export const CRON_EVENTSUB_RECONCILE = "*/30 * * * *"
export const CRON_TOKEN_REFRESH = "5,35 * * * *"
export const CRON_FOLLOW_SYNC = "10 * * * *"

// Stable job names for Workers Logs filtering (ADR 0053). One entry per job,
// not per cron: the minutely schedule runs two jobs.
const SCHEDULED_JOB_CRONS = {
  "eventsub-create": CRON_MINUTELY,
  "snooze-sweep": CRON_MINUTELY,
  "eventsub-reconcile": CRON_EVENTSUB_RECONCILE,
  "token-refresh": CRON_TOKEN_REFRESH,
  "follow-sync": CRON_FOLLOW_SYNC,
} as const

export type ScheduledJobName = keyof typeof SCHEDULED_JOB_CRONS

/**
 * `{ job, cron }` fields every scheduled job spreads into its summary and
 * failure logs, so Workers Logs can be filtered by job instead of by
 * free-text message.
 */
export function scheduledJobLogFields(job: ScheduledJobName): {
  job: ScheduledJobName
  cron: string
} {
  return { job, cron: SCHEDULED_JOB_CRONS[job] }
}
