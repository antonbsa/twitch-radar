# T-008: Notification Delivery And Ops

## Goal

Match processed Twitch state transitions against user preferences, send Web Push notifications, dedupe deliveries, and keep external state healthy over time.

## Spec Work

Define or confirm:

- notification matching rules.
- notification payload shape.
- delivery dedupe key rules.
- Web Push send behavior.
- invalid push subscription cleanup.
- EventSub reconciliation behavior.
- token refresh/reconnect behavior.
- retry and failure states.
- operational logging expectations.

Decision references:

- [ADR 0007](../../../docs/decisions/0007-monitor-broadcasters-globally-across-users.md)
- [ADR 0008](../../../docs/decisions/0008-send-category-notifications-only-for-future-matching-transitions.md)

## Implementation Scope

- matching per-channel category preferences.
- matching global category preferences.
- combined match deduplication.
- insert `notification_deliveries`.
- send Web Push to active push subscriptions.
- mark delivery status as sent or failed.
- remove or revoke invalid push subscriptions.
- EventSub reconciliation scheduled job.
- Twitch token refresh scheduled/on-demand job.
- follow sync scheduled/on-demand job refinement.
- operational logging and minimal observability.

## Acceptance Criteria

- `stream.online` in a desired category follows accepted notification semantics.
- `channel.update` switching into a desired category follows accepted notification semantics.
- Per-channel and global matches for the same user/event follow accepted notification dedupe semantics.
- Replayed queue messages or repeated webhooks do not send duplicate notifications.
- `notification_deliveries` records every attempted send.
- Successful sends are marked sent.
- Failed sends are marked failed with useful error context.
- Invalid push endpoints are marked revoked or disabled.
- EventSub subscriptions can be reconciled against Twitch state.
- Missing required EventSub subscriptions can be recreated.
- Unneeded EventSub subscriptions can be disabled or removed.
- Token refresh failures surface reconnect state.

## Completion Validation

- Preference matching tests cover per-channel, global, and combined matches.
- Delivery dedupe tests prove repeated events do not resend.
- Web Push send path is tested with a mocked push service.
- Invalid endpoint handling test marks subscription revoked/disabled.
- EventSub reconciliation test covers missing, active, and stale subscriptions.
- Token refresh/reconnect tests pass.
- Manual end-to-end notification path is validated before global MVP acceptance.

## Dependencies

- T-001 App Foundation.
- T-005 PWA Shell And Push.
- T-006 Preferences And Monitoring.
- T-007 EventSub And State.
