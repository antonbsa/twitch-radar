# Follow Sync

How the list of channels a user follows, and which of them are live, gets from Twitch into the app. Part of the [architecture overview](overview.md).

## What It Produces

A sync reads two things from Twitch with the user's token: the full list of followed channels, and the live streams among them ([ADR 0005](../decisions/0005-sync-followed-channels-with-twitch-apis.md)). It merges them into the shape the Channels tab renders, ordered like Twitch's sidebar: live channels first by viewer count, then offline ones by name. The browser never calls Twitch; it reads what the sync wrote.

A sync writes to two places:

- the user's **follows**, which are per user;
- the **channel state** of every followed broadcaster (live or not, category, since when), which is shared across users and seeds the state that event processing later builds on ([state and matching](state-and-matching.md)).

Seeding matters for correctness, not only display. A transition is only meaningful against a previous state, so a broadcaster needs a baseline before the first event for them arrives ([ADR 0030](../decisions/0030-monitored-broadcaster-lifecycle-and-state-seeding.md)).

## Three Ways A Sync Starts

| Trigger | When | Why |
| --- | --- | --- |
| The app, automatically | On load and whenever the app returns to the foreground, if the last sync is more than 30 minutes old | The list should be fresh when someone looks at it, without asking them to press anything |
| The user | The Sync button | An explicit refresh |
| A scheduled job | Hourly, for users whose last sync is more than a day old, a few per run, oldest first | Follows change when nobody opens the app, and global alerts depend on knowing who a user follows ([scheduled jobs](scheduled-jobs.md)) |

Users in the reconnect state are skipped by the job until they come back ([auth](auth.md)). A monthly job also refreshes stored avatars, since a sync only looks up avatars for follows that have none yet.

## Respond First, Persist After

The request path does the Twitch side, then answers, and writes to D1 after the response is sent. Twitch round trips dominate the latency, so the user sees the list as soon as they resolve, while the writes and monitoring maintenance finish behind it. The cost is a brief window where the UI is ahead of D1 if that background write fails; it is logged, and the next sync repairs it. The scheduled path, which has no response to hurry, writes inline.

This replaced a design where the sync ran as a queued background job with progress polling ([ADR 0042](../decisions/0042-async-follow-sync-with-progress-polling.md), rejected). It was drafted against a measured latency of 20 to 30 seconds that turned out to come from testing against the wrong deployment; once D1 writes were batched and Twitch fetches ran concurrently, a real 105-follow account synced in under a second ([TN 0004](../notes/0004-follow-sync-latency-root-cause.md)). An incremental sync that skips refetching unchanged follows was likewise judged unnecessary ([TN 0005](../notes/0005-incremental-follow-sync-not-justified.md)).

## Keeping The Monitored Set Current

After the writes, a user who holds a global alert has all their followed broadcasters made monitored, so a streamer they follow tomorrow is covered without them touching their alerts ([monitoring](monitoring.md), [ADR 0007](../decisions/0007-monitor-broadcasters-globally-across-users.md)). Unfollowing does not trigger cleanup: a broadcaster may stay monitored until reconciliation recomputes who is still needed, which only costs surplus subscriptions.
