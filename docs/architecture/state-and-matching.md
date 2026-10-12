# State Transitions And Matching

How a raw Twitch event becomes a change in a broadcaster's state, and how a state change becomes the list of users to notify. Part of the [architecture overview](overview.md).

## Two Kinds Of Record

The backend keeps what a broadcaster is doing _now_ separately from what _changed_ ([ADR 0006](../decisions/0006-store-current-channel-state-separately-from-history.md)):

- **Channel state**: one row per broadcaster the app tracks (monitored or followed by someone), with live or offline, current category and title, and the current stream. It is the source of truth and is shared across users.
- **State changes**: an append-only record of the transitions that matter. It is audit and the input to matching, never the way current state is computed.

Only meaningful transitions are recorded: a stream started, a stream ended, a category change while live. Refreshes, title-only edits and category changes while offline update the state but record nothing, so they can never lead to a notification.

## Processing An Event

The events queue consumer handles each message in a fixed order ([ADR 0033](../decisions/0033-eventsub-state-transition-rules.md)):

1. **Idempotency.** A message id already recorded is skipped. This unique key is the hard guarantee behind everything downstream, because Twitch retries and queues redeliver.
2. **Previous state.** Load the broadcaster's current state; with none, treat them as offline.
3. **Stale guard.** A message older than the one that last wrote the state is dropped entirely, so a late retry can neither overwrite newer state nor invent a transition. EventSub doesn't order deliveries and retries can arrive minutes later.
4. **Write the new state, then the change record.** In that order on purpose: if a crash loses the change record, the state is still right and a redelivery is a no-op, so a transition can be lost in that rare window but never duplicated.

What each event does:

- **Stream online.** The event has no category, so the consumer reads the stream from Twitch. A transition is recorded only for a genuinely new stream, so an online event for a stream already known as live (for instance seeded when an alert was created) just refreshes state.
- **Channel update.** Updates category and title whether live or not, keeping the state current for the next online event. A transition is recorded only while live and only if the category actually changed.
- **Stream offline.** Clears the stream-specific fields and records an ended transition only if the channel was live.

A stream's type is stored too. Reruns, playlists and watch parties are not live broadcasts, and an unknown type is treated as live, because only an observed non-live type is strong enough evidence to stay silent ([ADR 0051](../decisions/0051-suppress-non-live-stream-type-notifications.md)).

## Matching

When processing yields a transition, the matcher decides who to notify ([ADR 0034](../decisions/0034-notification-matching-and-delivery-pipeline.md), [ADR 0008](../decisions/0008-send-category-notifications-only-for-future-matching-transitions.md)):

- A stream started becomes a "started in category" trigger and a category change becomes a "switched into category" trigger. Nothing else notifies anyone, including a change whose new category is empty.
- Candidates are users with an active per-channel alert on that broadcaster and category, plus users with an active global alert on that category who follow the broadcaster. A user matched both ways is one candidate.

Then the candidates are filtered, cheapest and most definitive first, and each filter drops a user without leaving any row behind ([ADR 0054](../decisions/0054-user-controlled-notification-suppression.md), [ADR 0056](../decisions/0056-send-side-notification-cooldown.md)):

1. a non-live stream type, for everyone;
2. a global-alert exclusion of this broadcaster, which narrows only that global alert, not a per-channel alert for the same broadcaster and category;
3. the user's pause-all;
4. the user's mute of this broadcaster;
5. the 15-minute cooldown for this user and broadcaster, measured from the last push actually sent.

What survives gets a pending delivery row and a job on the notifications queue ([notification delivery](notification-delivery.md)). Suppression happens at match time, not send time, so a suppressed event costs no queue work and no push.

## Why Layered Replay Safety

Each stage may over-produce, and the next one absorbs it: the message id guards state processing, the delivery's unique key (user, broadcaster, category, trigger, stream) guards staging, and the sender only acts on a delivery that is still pending. A redelivered message returns its existing change record, so matching re-runs after a crash between processing and enqueue, and any delivery still pending is enqueued again. The cost of that robustness is occasional redundant work; the benefit is that no crash point leads to a missed or doubled alert without another layer catching it.

## Known Limits

- The cooldown is evaluated against sent deliveries only, so two matches processed within the queue's latency, a few seconds, can both pass. Counting pending rows would close that, but would let a stuck delivery silence a user.
- A genuine change the user would want, such as moving from one desired category to another within 15 minutes, is dropped by the cooldown. That trade-off is accepted ([ADR 0056](../decisions/0056-send-side-notification-cooldown.md)).
