# Observability And Error Alerting

How the backend records what it did and tells someone when it breaks. Part of the [architecture overview](overview.md).

## Logs

The Worker logs through a thin custom wrapper, not a library: leveled methods that emit one JSON object per line (level, message, timestamp, fields), which Cloudflare's Workers Logs indexes so fields can be filtered in the dashboard ([ADR 0040](../decisions/0040-structured-leveled-logging-convention.md)). The runtime is hostile to most Node loggers, and the platform already does the field extraction a library would provide.

- **The level follows the environment.** Local and preview log at debug, production at info, so production skips the per-minute chatter of jobs that found nothing to do ([ADR 0053](../decisions/0053-self-describing-scheduled-job-logs.md)).
- **Errors have one shape**, with message, stack, cause and, where present, an HTTP status and code, truncated so one failure can't swamp a log. The Twitch client and the push sender keep the failing response body, since the useful part of a rejection is usually in it.
- **Scheduled jobs name themselves.** Each job's summary and failure logs carry a stable job name, so a job can be filtered directly.
- **Local output is for humans.** In local development logs render as readable multi-line text, because nothing ingests them. An unmigrated local database is recognized and logged with a hint to run the setup command, as it is the most common cause of an unhandled error in a fresh checkout.

Logs answer "what happened to this row"; the delivery table answers "did this notification go out" ([notification delivery](notification-delivery.md)).

## Error Alerting

Logs are not enough to notice a problem. The motivating incident ran for more than a week unobserved: the same error repeated about ten thousand times because nothing grouped it or told anyone ([ADR 0047](../decisions/0047-error-alerting-via-sentry-and-slack-webhook.md)). The design has two parts with different jobs.

- **Sentry is the durable record.** The Worker's three entry points (requests, queues, cron) are wrapped by Sentry's in-Worker SDK, which works on the free plan because it reports over plain HTTP. What matters about it is grouping: thousands of identical failures collapse into one issue with a counter, and alerts fire on a newly seen issue.
- **Slack is the page.** The Worker posts to a Slack incoming webhook itself instead of through Sentry's integration. That keeps working when Sentry is unreachable or its quota is used up, which is exactly when an alert matters most, and removes the dependency on what a free Sentry plan includes.

Volume is controlled by structure, not random sampling, which would drop the rare unique error and still let a loop spend the quota. Inside a scheduled job or queue batch, every failing item is logged individually but the invocation reports **once**, aggregated. So a permanently failing row is one event a minute at worst, not one per row.

Only production pages anyone: the Sentry environment tag is taken from the app's environment and alert rules filter on production. Preview reports but is quiet, and local never reports. Both the Sentry DSN and the Slack webhook are optional secrets, so a fresh checkout or CI simply doesn't report, and an alert that fails to send never fails the request, message or job it was about.

## What Isn't Covered

The browser has no error reporting yet; its one log call is gated to development builds ([ADR 0040](../decisions/0040-structured-leveled-logging-convention.md)).
