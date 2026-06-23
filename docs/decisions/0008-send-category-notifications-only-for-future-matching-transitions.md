# 0008 - Send Category Notifications Only For Future Matching Transitions

## Status

Accepted

## Context

Users configure category preferences for channels they follow. Some streams may already be live and matching at the moment a preference is created. Sending an immediate notification in that case can be surprising because no new stream/category transition occurred.

## Decision

Send category notifications when:

- a followed channel starts streaming in a desired category;
- a followed live channel switches into a desired category.

Do not send category notifications when:

- a channel goes offline;
- an offline channel changes category;
- a user creates a preference for a stream that is already live and already matching.

Deduplicate deliveries with one delivery per user, broadcaster, category, stream, and trigger type.

Use these trigger types:

- `stream_started_in_category`
- `switched_into_category`

If both per-channel and global preferences match the same user/event, send only one notification.

## Consequences

- Preference creation seeds state but does not send catch-up notifications.
- `notification_deliveries` needs a uniqueness key covering user, broadcaster, category, stream, and trigger type.
- A stream that leaves and re-enters a category will not notify again unless a future ADR changes the dedupe semantics.
