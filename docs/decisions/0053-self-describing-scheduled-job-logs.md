# 0053 - Self-Describing Scheduled Job Logs

## Status

Accepted. The `cron` field and the job → cron mapping are dropped by [ADR 0057](0057-single-minutely-cron-trigger.md): with one schedule, only `job` identifies the source.

## Context

[Issue #103](https://github.com/antonbsa/twitch-radar/issues/103): in Workers Logs, every minutely cron invocation appears as a platform-generated `cf-worker-event` entry whose `message` is just the raw trigger (`* * * * *`). Our own structured logs (ADR 0040) show up as sibling entries sharing its `requestId`, but on a quiet minute there were none — both jobs on the minutely branch (`createPendingEventsubSubscriptions`, `sweepNotificationSnoozes`) returned early without logging when there was nothing to do. A no-op run was indistinguishable from one whose jobs never ran. Separately, none of the scheduled jobs' logs (ADR 0036) carried a field naming the job, so filtering the dashboard by job meant matching free-text `message` strings.

## Decision

- **Every scheduled job's summary and failure logs carry stable `job` and `cron` fields.** Job names are `eventsub-create`, `snooze-sweep`, `eventsub-reconcile`, `token-refresh`, `follow-sync`. They are defined once, as a job → cron mapping in `apps/api/src/crons.ts` next to the cron constants, and read through `scheduledJobLogFields(job)` — not a second hand-maintained list. The mapping is keyed by job rather than by cron because the minutely schedule runs two jobs, each with its own name. `cron` is the schedule that owns the job, which is the one `scheduled()` dispatched on.
- **The minutely schedule gets its own constant (`CRON_MINUTELY`)** matching `wrangler.jsonc`, so its jobs appear in the mapping like the others; `scheduled()` still reaches them through its `default` branch.
- **The minutely jobs log their empty case at `debug`** ("... found nothing to do"). Preview/local (min level `debug`) show one entry per job per minute; production (min level `info`) drops them, avoiding ~2880 empty info lines/day. Runs that did work keep their existing `info` summaries, unchanged in content apart from the added fields.
- **Per-job logging stays**, rather than having jobs return a summary object for `scheduled()` to log once per invocation. That alternative would change every job's return type for a marginal gain (one entry instead of two on the minutely run).
- `sweepNotificationSnoozes` gains the same top-level try/catch as the other scheduled jobs, so its failure log carries `job` too instead of only reaching `scheduled()`'s generic backstop.

## Consequences

- Workers Logs can be filtered by `job` (or `cron`) directly. A new scheduled job must add an entry to the mapping in `crons.ts` and spread `scheduledJobLogFields(...)` into its summary and failure logs.
- In production a quiet minutely run still produces no log entries of our own — seeing its no-op outcome requires preview (or temporarily lowering the production min level in `logger.ts`).
- `scheduled()`'s pre-dispatch backstop log ("Scheduled job failed") still carries only `cron`: it fires before any job starts, so no single job name applies.
