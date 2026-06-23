# T-005: EventSub And State

## Goal

Receive Twitch EventSub webhooks, verify them, process stream/category events, and maintain current channel state plus relevant state-change history.

## Spec Work

Define or confirm:

- EventSub subscription creation contract.
- webhook verification algorithm.
- callback challenge response behavior.
- event queue payload shape.
- idempotency keys.
- state transition rules for each EventSub type.
- relevant `channel_state_changes` rules.

Decision references:

- [ADR 0004](../../../docs/decisions/0004-use-twitch-eventsub-webhooks.md)
- [ADR 0006](../../../docs/decisions/0006-store-current-channel-state-separately-from-history.md)

## Implementation Scope

- EventSub subscription creation for:
  - `stream.online`
  - `stream.offline`
  - `channel.update`
- subscription persistence in `eventsub_subscriptions`.
- webhook route:
  - `POST /api/webhooks/twitch/eventsub`
- Twitch signature verification against raw body.
- callback verification challenge handling.
- duplicate message detection.
- enqueue verified messages for async processing.
- queue consumer for EventSub messages.
- process `stream.online`.
- process `channel.update`.
- process `stream.offline`.
- update `channel_state`.
- insert relevant `channel_state_changes`.

## Acceptance Criteria

- EventSub subscriptions can be created for monitored broadcasters.
- Created EventSub subscriptions are persisted locally.
- Webhook challenge requests return the required challenge response.
- Invalid webhook signatures are rejected.
- Valid webhook messages are enqueued and acknowledged quickly.
- Duplicate EventSub message IDs do not create duplicate state changes.
- `stream.online` marks channel live and records `stream_started`.
- `stream.online` fetches current stream/category data when needed for matching.
- `channel.update` compares previous and next category while live.
- `channel.update` while offline does not trigger notification work.
- `stream.offline` marks channel offline and records `stream_ended`.
- `channel_state` remains the current source of truth.
- `channel_state_changes` stores relevant transitions only.

## Completion Validation

- Webhook challenge test passes.
- Signature verification tests pass for valid and invalid signatures.
- Queue consumer tests process fixtures for `stream.online`, `channel.update`, and `stream.offline`.
- Duplicate message test proves idempotency.
- State transition tests verify previous-vs-next comparison behavior.

## Dependencies

- T-001 App Foundation.
- T-004 Preferences And Monitoring.
