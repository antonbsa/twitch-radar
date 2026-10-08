# 0058 - Cache Category Box Art In D1 And Attach It To API Responses

## Status

Accepted

## Context

Issues #27 and #77: category search results already show box art, but the places that show a category from stored data have none. Preferences (`channel_category_preferences`, `global_category_preferences`) carry only a category id and name, so the Alerts chips, `ChannelPreferencesSheet` and the exclusions dialog title have nothing to render. Twitch only exposes box art through Get Games (`GET /helix/games?id=…`, up to 100 ids per call) and Search Categories. Deriving `ttv-boxart/<id>-{width}x{height}.jpg` from the id is not an option: real URLs carry a suffix (e.g. `27471_IGDB-…`), and the pattern is undocumented.

## Decision

- **A `category_box_art` table (`id` PK, nullable `box_art_url`, `updated_at`) caches the Twitch template URL per category id.** It is global, not per user, like `channel_state` (ADR 0007). Names stay where they already are; the table holds only what is missing.
- **It fills lazily, on read.** `GET /preferences` and the preference create endpoints look up the category ids they are about to return; ids not cached are fetched in one batched Get Games call with the caller's token and stored. An id Twitch does not return, or returns without art, is stored with a null URL so it is not asked again. `GET /categories/search` also upserts every result, which makes the usual path (search, then create a preference) a cache hit.
- **The preference wire shapes gain a nullable `box_art_url`** (channel and global items). The value is Twitch's `{width}x{height}` template, as `/categories/search` already returns it (ADR 0028 types are updated on the web side).
- **A failed Get Games never fails the response.** The error is logged, ids stay uncached (so the next read retries) and their URL is `null`; the web renders the placeholder.
- **No backfill migration.** Missing rows are the normal cold state, and the first read fills them (the "no backward-compatibility code" rule does not apply: null is a legitimate value, not a legacy state).
- **No expiry.** Box art for a category id is effectively static; a stale image is not worth a refresh job.
- **The web renders it through one `CategoryBoxArt` component** with fixed sizes in the 3:4 poster ratio: the 40x54 search-result size, and a small size for chips and the exclusions dialog title. The live category on the channel detail sheet was tried and dropped: the art next to the `text-xs` category line was not practical, so followed channels carry no box art.

## Consequences

- A cold read (first load after deploy, or a new category) adds one Twitch call; steady state adds one D1 `SELECT` per response, chunked at 100 ids (D1 parameter limit).
- `GET /preferences` now depends on Twitch for cold ids; the degrade-to-null rule keeps them available when Twitch is down.
- Rejected: storing the URL on each preference row (needs a backfill for existing rows, and ties art to preferences only); deriving the URL from the id (undocumented); having the web call Search Categories per name (extra round trips from the client, ambiguous matches).
