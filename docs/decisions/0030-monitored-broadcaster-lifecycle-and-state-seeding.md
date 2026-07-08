# 0030 - Monitored Broadcaster Lifecycle And State Seeding

## Status

Accepted

## Context

ADR 0007 decided broadcasters are monitored globally (one EventSub subscription set per unique broadcaster) and ADR 0008 requires a current-state baseline before transition comparisons can work. T-006 implements the maintenance of `monitored_channels`, the seeding of `channel_state`, and the handoff to T-007's EventSub subscription creation. Open questions were the enable/disable mechanics, when to seed state (and when not to), and what "enqueue or call EventSub ensure logic" concretely means before T-007 exists.

## Decision

All logic lives in `apps/api/src/services/monitoring.ts` and runs synchronously inside the mutating request (preference create/delete, follow sync) — no background job at this stage.

- **Ensure** (`ensureMonitoredBroadcasters`) runs on preference create with the affected broadcasters — the single selected broadcaster for a channel preference (`monitor_reason: "channel_preference"`), all of the user's followed broadcasters for a global preference (`"global_preference"`). It upserts `monitored_channels` keyed by broadcaster: an existing row is re-enabled (`disabled_at` cleared) and its names/reason refreshed. `monitor_reason` is informational (last writer wins); the authoritative "is this broadcaster still needed" answer is always recomputed from preferences.
- **Follow sync participates in upkeep:** after `syncFollowedChannels` upserts follows, a user holding any active global preference gets the ensure step for the full followed set, so newly followed broadcasters become monitored without waiting for another preference mutation (ADR 0007's "all currently followed broadcasters").
- **EventSub handoff is pending local rows, not a queue.** Ensure writes one `eventsub_subscriptions` row per monitored event type (`stream.online`/`stream.offline` v1, `channel.update` v2) with `status: "pending"` and the callback URL derived from `API_URL`, inserted with on-conflict-do-nothing on the broadcaster/type/version unique index. T-007's creation/reconciliation job owns everything after that: creating pending rows on Twitch, repairing statuses, and dropping subscriptions for disabled broadcasters. No new queue binding was added for this.
- **State seeding is fill-only.** After ensure, broadcasters with no `channel_state` row are fetched in bulk from Twitch Get Streams (`/helix/streams?user_id=…`, batched at 100) with the requesting user's token and written as live (full stream data) or offline rows. Broadcasters that already have a row are never re-fetched — once a row exists, EventSub-driven updates (and follow sync) own it, and clobbering it with poll data could fabricate or swallow a transition.
- **Cleanup** (`cleanupMonitoringForBroadcasters`) runs on preference delete with the affected broadcasters (the one broadcaster for a channel preference, the user's followed set for a global one). A broadcaster stays monitored if any user's active channel preference references it, or any user with an active global preference follows it. Otherwise the `monitored_channels` row is soft-disabled (`disabled_at` set) — the signal for T-007 reconciliation to remove Twitch-side subscriptions. Rows are never hard-deleted here.

## Consequences

- `monitored_channels.disabled_at` is the single flag downstream consumers (T-007 event processing, T-008 matching) must respect; disabled broadcasters may still have rows everywhere else.
- Preference mutations do O(affected broadcasters) work inline, including a Twitch API call when unseeded broadcasters are involved; global preference create/delete for heavy followers is the worst case.
- Cleanup after unfollowing alone doesn't run (nothing triggers it), so a broadcaster can stay monitored until the next preference delete or T-007 reconciliation recomputes need — harmless surplus monitoring, and reconciliation is the designated janitor (ADR 0007).
- The test seam gained `POST /api/__test__/inspect` to read `monitored_channels` / `eventsub_subscriptions` / `channel_state` by broadcaster id, since the public API deliberately never exposes them.
