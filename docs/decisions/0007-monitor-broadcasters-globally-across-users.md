# 0007 - Monitor Broadcasters Globally Across Users

## Status

Accepted

## Context

Multiple users can follow or configure preferences for the same broadcaster. Creating EventSub subscriptions per user would duplicate external subscriptions and increase reconciliation work.

## Decision

Create EventSub subscriptions globally per unique broadcaster, not per user.

For every broadcaster in `monitored_channels`, ensure these EventSub subscriptions exist:

- `stream.online`
- `stream.offline`
- `channel.update`

For per-channel preferences, monitor only the selected broadcasters.

For a user with any global category preference, monitor all currently followed broadcasters for that user.

Run reconciliation to compare local `eventsub_subscriptions` against Twitch state and repair missing, failed, revoked, or unneeded subscriptions.

## Consequences

- User preferences map many users to one broadcaster-level subscription set.
- Global preferences can increase monitored broadcaster count significantly.
- Reconciliation must account for whether any active preference still requires a broadcaster.
