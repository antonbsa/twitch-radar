# T-006: Preferences And Monitoring

## Goal

Allow users to select category notification preferences and ensure the required broadcasters are monitored.

## Spec Work

Define or confirm:

- category search API contract.
- per-channel preference contract.
- global preference contract.
- preference list response shape.
- monitor eligibility rules.
- monitored broadcaster lifecycle.
- channel state seeding rules.
- behavior when selected channel is already live in a matching category.

Decision references:

- [ADR 0007](../../../docs/decisions/0007-monitor-broadcasters-globally-across-users.md)
- [ADR 0008](../../../docs/decisions/0008-send-category-notifications-only-for-future-matching-transitions.md)

## Implementation Scope

- `GET /api/categories/search?q=...`.
- `GET /api/preferences`.
- `POST /api/preferences/channel`.
- `DELETE /api/preferences/channel/:id`.
- `POST /api/preferences/global`.
- `DELETE /api/preferences/global/:id`.
- upsert `channel_category_preferences`.
- upsert `global_category_preferences`.
- maintain `monitored_channels`.
- seed `channel_state` when monitoring starts.
- enqueue or call EventSub subscription ensure logic for monitored broadcasters.

> UI for category search, per-channel preferences, and global preferences is implemented in T-004 UI Views.

## Acceptance Criteria

- User can search Twitch categories.
- User can save a category preference for a specific followed channel.
- User can save a global category preference.
- User can list saved preferences.
- User can remove saved preferences.
- Per-channel preference creates monitoring only for that broadcaster.
- Global preference creates monitoring for followed broadcasters.
- Removing the last preference requiring a broadcaster disables or makes it eligible for monitor cleanup.
- Initial `channel_state` is seeded before future comparisons are expected.
- Creating a preference for an already-live matching stream follows the accepted notification semantics ADR.
- Preference creation is idempotent for the same user/channel/category or user/category pair.

## Completion Validation

- Category search works with mocked Twitch category responses.
- Preference create/delete tests pass for channel and global preferences.
- Monitoring setup tests verify `monitored_channels` changes.
- State seeding tests verify current stream/channel data is written.

## Dependencies

- T-001 App Foundation.
- T-002 Twitch Auth And Sync.
- T-004 UI Views.
