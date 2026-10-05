# 0054 - User-Controlled Notification Suppression: Pause, Broadcaster Mute, Global Category Exclusions

## Status

Accepted

## Context

Users can only stop unwanted notifications today by disabling the preference that produces them (`disabled_at` on channel/global category preferences, ADR 0029). That loses the configuration and is too coarse for three recurring needs:

- Stop everything for a while without dismantling every preference ("do not disturb").
- Stop one broadcaster entirely, whichever preference would match them.
- Keep a global category preference ("anyone I follow starting Just Chatting") but drop a few specific broadcasters from it.

All three change who `matchAndCreateDeliveries` (`apps/api/src/services/notifications/match.ts`) notifies, which is the matching semantics ADR 0034 and ADR 0008 define, and they have to compose with the existing non-live suppression (ADR 0051), snooze reminders (ADR 0048) and the per-user/broadcaster cooldown planned in issue #92.

## Decision

**Three suppression mechanisms, each with its own storage:**

- **Pause all:** `users.notifications_paused_at` (nullable). Set means no notification of any kind reaches the user. It's a user state, not a list entry, so it lives on `users` rather than as a sentinel row.
- **Broadcaster mute:** table `broadcaster_mutes (id, user_id, broadcaster_user_id, created_at, disabled_at)`, unique on `(user_id, broadcaster_user_id)`. An active row suppresses every notification about that broadcaster for that user.
- **Global category exclusion:** table `global_category_preference_exclusions (id, preference_id → global_category_preferences.id, broadcaster_user_id, created_at, disabled_at)`, unique on `(preference_id, broadcaster_user_id)`. An active row removes that broadcaster from that one global preference's matches. Exclusions hang off the preference, so they survive disabling and reviving it, and no exclusion exists without a preference.

Pause and mute are indefinite: they last until the user reverts them. Mutes and exclusions follow the existing idempotent-create / soft-disable convention (ADR 0029, ADR 0030): create revives a disabled row (`201` new, `200` revived), delete sets `disabled_at` and returns `204`.

**Suppression happens at match time.** `matchAndCreateDeliveries` drops suppressed users before staging any `notification_deliveries` row, like the non-live check (ADR 0051): nothing is enqueued and no `skipped` row is written. Filter order:

1. Non-live `stream_type` (ADR 0051) — per change, before any per-user work.
2. Global preferences: drop users whose matching global preference has an active exclusion for the broadcaster. Channel preferences are not affected.
3. Pause all: drop users with `notifications_paused_at` set.
4. Broadcaster mute: drop users with an active mute for the broadcaster.
5. Issue #92's cooldown, when it lands, runs on what is left.

**Scope of each mechanism:**

- An exclusion only narrows its own global preference. A channel preference for the same broadcaster/category still notifies: it's an explicit, more specific choice than the global one it overrides.
- Pause and mute suppress everything, including snooze reminders: `sweepNotificationSnoozes` applies the same pause/mute check and marks a suppressed snooze `expired` instead of firing it. The most recent user action wins. Exclusions don't affect snoozes, for the same reason they don't affect channel preferences.
- An exclusion for a broadcaster the user stops following stays as is. The global preference can't match an unfollowed broadcaster anyway, and the exclusion applies again if they re-follow, so follow sync does no cleanup.

## Consequences

- Muted, paused or excluded matches leave no trace in `notification_deliveries`. The `channel_state_changes` row still records the transition, and the user's suppression state explains the silence. Accepted, because the suppression is an explicit user action rather than a pipeline failure.
- A delivery already enqueued when the user pauses or mutes still goes out. The window is the queue latency (seconds), which is not worth a second check in `deliverNotification`.
- An indefinite pause or mute can be forgotten. The web UI must keep the state visible: a persistent banner while paused, a muted indicator on channel rows, and a list of muted channels on the Alerts page.
- Matching does one or two more per-change reads: pause state for matched users, and active mutes/exclusions for the broadcaster. All are indexed lookups bounded by the matched-user set.
- Timed durations later are additive: a nullable `expires_at` on `users`/`broadcaster_mutes` and an expiry condition in the same checks, with no change in shape.
