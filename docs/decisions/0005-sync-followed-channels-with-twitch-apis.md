# 0005 - Sync Followed Channels With Twitch Follow And Stream APIs

## Status

Accepted

## Context

The MVP needs the user's full followed-channel list and the currently live subset with stream metadata.

Relevant Twitch references:

- https://dev.twitch.tv/docs/api/reference/#get-followed-channels
- https://dev.twitch.tv/docs/api/reference/#get-followed-streams
- https://dev.twitch.tv/docs/authentication/scopes/

## Decision

Use Twitch OAuth scope `user:read:follows`.

Use `GET /helix/channels/followed` to sync the full followed-channel list.

Use `GET /helix/streams/followed` to sync live stream metadata for followed channels.

Merge those datasets for the followed-channel API/UI.

Order followed channels like Twitch's sidebar:

1. live channels first;
2. live channels by viewer count descending;
3. offline channels below, with display name as a stable fallback sort.

## Consequences

- Follow sync must handle Twitch pagination.
- The UI can render a Twitch-like followed-channel list without calling Twitch directly.
- Live metadata in D1 may be cache-like and refreshed by follow sync or event processing.
