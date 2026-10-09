# 0057 - Single Minutely Cron Trigger With Time-Based Job Dispatch

## Status

Accepted

## Context

Cloudflare caps Cron Triggers account-wide (API error 10072: 5 per account), not per Worker. ADR 0036 gave every scheduled job its own cron expression, so production registered 4 triggers and preview was left with the 1 remaining slot: preview ran only the minutely job, and the snooze sweep (ADR 0048) and the monthly avatar refresh had to be squeezed into existing branches because no slot was free. Every new schedule would cost a slot in each environment.

## Decision

- **Each environment registers one cron, `* * * * *`.** `scheduled()` runs the minutely jobs (`eventsub-create`, `snooze-sweep`, `token-refresh`) on every invocation and decides which periodic job is also due from the UTC minute of `controller.scheduledTime`: `eventsub-reconcile` at minutes 0 and 30, `follow-sync` at 10 (with the monthly `avatar-refresh` still gated inside that slot). The minute table lives in `src/crons.ts`. The periodic jobs keep the cadences ADR 0036 set and never share a minute, so an invocation runs at most one of them.
- **Creations are capped at 10 per run on invocations that also run a periodic job** (30 otherwise): reconcile can spend ~20 Twitch calls from the same 50-subrequest free-plan budget, and a create that hits the limit would count toward ADR 0049's terminal `failed` status. The backlog drains at full speed on the other minutes.
- **Jobs run sequentially in one invocation**, each already catching and logging its own failure, so one failing job doesn't skip the next.
- **`scheduledTime`, not `Date.now()`, picks the slot**, so a delayed invocation still runs the job it was scheduled for.
- **Preview gets every job**, since it no longer needs more than one trigger.
- **Job logs drop the `cron` field** (ADR 0053): every job now has the same schedule, so only `job` identifies the source.
- **Tests trigger a job by simulating its time** through Miniflare's `/cdn-cgi/local/scheduled?time=<epoch ms>`; wrangler's `/__scheduled` forwards only `cron` and drops `time`.

## Consequences

- The account uses 2 cron triggers (production + preview) instead of 5, leaving room for other Workers and for future jobs, which add a minute-table entry instead of a trigger.
- Jobs no longer get their own invocation: the minutely jobs and the due periodic job share one subrequest budget and CPU/duration envelope. At current scale this is well within limits; a job that outgrows it should move to its own queue consumer rather than reclaim a trigger.
- A skipped platform invocation drops that minute's periodic job until its next slot, as it did with separate crons.
- Supersedes ADR 0036's "one cron per job" dispatch on `controller.cron` and the cron-cap workaround in ADR 0048 and ADR 0041's preview gap; the jobs themselves, their cadences and their logic are unchanged.

## Update: token refresh moves to the minutely jobs

- `token-refresh` runs on every invocation with small caps (2 refreshes and 3 validations per run) instead of 10 and 20 at minutes 5 and 35. Capacity rises from 20 refreshes and 40 validations per hour to 120 and 180, enough to keep hourly validation (Twitch's ask) past 100 users, and the job spends at most ~8 Twitch calls per invocation instead of a burst of up to ~50, which the 50-subrequest Free-plan budget shared with reconcile and creations could not absorb.
- Empty sweeps log at `debug`, like the snooze sweep, so a no-op minute adds no `info` noise.
