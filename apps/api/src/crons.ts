// Cron expressions must match wrangler.jsonc's `triggers.crons` exactly —
// `controller.cron` is the raw matched expression the scheduled() handler
// dispatches on (ADR 0036). Kept in their own module so tests can address a
// specific job through `/__scheduled?cron=...` without importing the worker.
export const CRON_EVENTSUB_RECONCILE = "*/30 * * * *"
export const CRON_TOKEN_REFRESH = "5,35 * * * *"
export const CRON_FOLLOW_SYNC = "10 * * * *"
