// The Worker has one cron trigger per environment, firing every minute, and
// `scheduled()` decides which jobs are due from `controller.scheduledTime`
// (ADR 0057): Cloudflare caps cron triggers account-wide, so one trigger per
// environment replaces one per job. Kept in its own module so tests can
// import the schedule without the worker. Must match wrangler.jsonc's
// `triggers.crons` in every environment.
export const CRON_MINUTELY = "* * * * *"

// Jobs that run on every invocation.
const MINUTELY_JOBS = ["eventsub-create", "snooze-sweep"] as const

// UTC minutes of the hour each periodic job runs at. They never share a
// minute, so an invocation runs at most one of them next to the minutely jobs.
export const PERIODIC_JOB_MINUTES = {
  "eventsub-reconcile": [0, 30],
  "token-refresh": [5, 35],
  "follow-sync": [10],
} as const

export type PeriodicJobName = keyof typeof PERIODIC_JOB_MINUTES

// Stable job names for Workers Logs filtering (ADR 0053). "avatar-refresh"
// is monthly, gated inside the hourly follow-sync slot (ADR 0048).
export type ScheduledJobName =
  (typeof MINUTELY_JOBS)[number] | PeriodicJobName | "avatar-refresh"

/** Whether `job` is due at the UTC minute of `scheduledTime` (epoch ms). */
export function isPeriodicJobDue(
  job: PeriodicJobName,
  scheduledTime: number,
): boolean {
  const minute = new Date(scheduledTime).getUTCMinutes()
  return (PERIODIC_JOB_MINUTES[job] as readonly number[]).includes(minute)
}

/**
 * `{ job }` field every scheduled job spreads into its summary and failure
 * logs, so Workers Logs can be filtered by job instead of by free-text
 * message.
 */
export function scheduledJobLogFields(job: ScheduledJobName): {
  job: ScheduledJobName
} {
  return { job }
}
