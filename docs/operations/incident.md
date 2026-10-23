# Stopping A Misbehaving Pipeline

When a deployed Worker is doing damage (repeat pushes, a job hammering the Twitch API, a loop), stop the pipeline first and fix the code through the normal release afterwards. A fix through the release pipeline takes the full suite plus a deploy; these levers act in seconds and need no code change. Run them from `apps/api`, with `-preview` queue names and `--env preview` for preview.

| Pipeline | Lever | What stops | What to watch |
| --- | --- | --- | --- |
| Push delivery | `npx wrangler queues pause-delivery twitch-radar-notification-jobs` | Every push, including snooze reminders | Matching keeps enqueueing while paused, so the backlog is late on resume |
| EventSub processing | `npx wrangler queues pause-delivery twitch-radar-twitch-events` | Channel State updates and new notification matches | Webhooks are still accepted and queued; on resume, an event older than the last one applied to that Channel State is ignored as a Stale Event ([ADR 0033](../decisions/0033-eventsub-state-transition-rules.md)) |
| Scheduled jobs | Delete the cron trigger on the Worker's settings page in the Cloudflare dashboard | All jobs at once: there is one trigger for every job ([ADR 0057](../decisions/0057-single-minutely-cron-trigger.md)), so token refresh and EventSub creation stop too | The next `wrangler deploy` restores the trigger from `wrangler.jsonc` |
| The whole Worker | `npx wrangler rollback --env production -m "<reason>"` | The new code, back to the previous version | D1 isn't rolled back: if the release ran a migration, the old code must still work on the new schema, or restore with Time Travel ([backup and restore](backup-and-restore.md)) |

Resume a queue with `npx wrangler queues resume-delivery <queue>`. A push is only meaningful while it's still true (a channel just went live in a category), so purge the notification backlog before resuming unless the pause was a few seconds: `npx wrangler queues purge twitch-radar-notification-jobs` deletes every stored message, irreversibly. Messages still expire past the queue's retention period while paused.

Two pipelines have no lever yet: a single scheduled job can't be stopped without stopping the rest, and the on-demand follow sync (login and the Sync button) only stops with a rollback.

The `CLOUDFLARE_API_TOKEN` used for these commands needs the Account › Queues › Edit permission: without it `pause-delivery` fails with `Authentication error [code: 10000]` while read-only commands like `wrangler queues info` still work, so a token that deploys fine can still be missing it. Rehearse on preview after creating or rotating the token: pause and resume `twitch-radar-notification-jobs-preview` and check both commands succeed.

After the pipeline is stopped and the code fixed, a bad write or migration may also need a restore: see [backup and restore](backup-and-restore.md). Why production only moves on a release: [deploy and release](../architecture/deploy-and-release.md).
