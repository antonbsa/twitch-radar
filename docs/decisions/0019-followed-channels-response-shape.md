# 0019 - Followed Channels API Response Shape

## Status

Accepted

## Context

`GET /api/channels/followed` is the primary read endpoint for the UI. It must return per-channel data (identity, follow date) merged with live stream state (viewer count, category, etc.).

Two response shapes were considered:

1. **Flat array with merged fields**: `{ data: FollowedChannelItem[] }` where each item carries both follow-record fields and stream-state fields (null when offline).
2. **Paginated envelope**: `{ data: FollowedChannelItem[], meta: { total: number, ... } }` for future pagination support.

A followed-channel list for a typical Twitch user fits in a single JSON response (Twitch caps follows at a few thousand); server-side pagination adds complexity with no near-term benefit.

## Decision

Return `{ data: FollowedChannelItem[] }` — a flat array wrapped in a `data` key, consistent with the other read endpoints and ADR 0009.

Each item includes:

| field | source |
| --- | --- |
| `broadcaster_user_id` | `followed_channels` |
| `broadcaster_login` | `followed_channels` |
| `broadcaster_display_name` | `followed_channels` |
| `broadcaster_profile_image_url` | `followed_channels` (null until future task fetches it) |
| `followed_at` | `followed_channels` |
| `is_live` | `channel_state` |
| `stream_id` | `channel_state` |
| `category_id` | `channel_state` |
| `category_name` | `channel_state` |
| `title` | `channel_state` |
| `viewer_count` | `channel_state` |
| `started_at` | `channel_state` |

Stream-state fields are `null` for offline channels.

Sort order (applied server-side): live channels first → viewer count descending → display name ascending.

## Consequences

- No pagination cursor needed; add it in a later task if follow lists grow large enough to cause payload or latency issues.
- The client receives a fully merged, sorted list in one request with no further joins needed.
- `broadcaster_profile_image_url` will be `null` until a dedicated fetch step is added (deferred beyond T-002).
