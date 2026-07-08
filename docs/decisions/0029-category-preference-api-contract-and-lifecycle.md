# 0029 - Category Preference API Contract And Lifecycle

## Status

Accepted

## Context

T-006 implements category search and per-channel/global category preferences. The endpoint list existed in the architecture spec, but the wire shapes, idempotency semantics, delete behavior, and eligibility rules needed decisions. The preference tables (`channel_category_preferences`, `global_category_preferences`) already carry a `disabled_at` column and per-user uniqueness indexes.

## Decision

- **Category search** is `GET /api/categories/search?q=...` (authenticated). It proxies Twitch `GET /helix/search/categories` with the user's token (`first=20`, single page — a type-ahead needs relevance, not completeness) and returns `{ "data": [{ "id", "name", "box_art_url" }] }`. A blank or missing `q` is `400 invalid_request`; a Twitch 404 (no matches) maps to an empty list, not an error.
- **List** is `GET /api/preferences` returning both kinds in one payload of *active* rows only:

  ```json
  {
    "data": {
      "channel": [{ "id": "cpref_…", "broadcaster_user_id": "…", "category_id": "…", "category_name": "…", "created_at": "…" }],
      "global": [{ "id": "gpref_…", "category_id": "…", "category_name": "…", "created_at": "…" }]
    }
  }
  ```

  `user_id` (implied by the session) and `disabled_at` (always null in the list) are not exposed. The shapes are mirrored in `apps/web/src/types/preference.ts` (ADR 0028).
- **Create is an idempotent upsert on the preference's natural key** — user/broadcaster/category for `POST /api/preferences/channel`, user/category for `POST /api/preferences/global`. A new row (`cpref_<nanoid>` / `gpref_<nanoid>`) returns `201`; a repeat (including one after a delete) revives the existing row in place — `category_name` refreshed, `disabled_at` cleared — and returns `200` with the same id. Both return the full record.
- **Channel preference eligibility:** the broadcaster must be in the user's `followed_channels`, otherwise `400 invalid_request`. This bounds monitoring to followed channels (ADR 0007) and lets the API copy login/display name from the followed row into `monitored_channels`.
- **Delete is a soft disable.** `DELETE /api/preferences/{channel,global}/:id` sets `disabled_at` and returns `204`; repeating it is a no-op `204`; an unknown id or another user's preference is `404 not_found`. Rows are kept so notification-dedupe history survives a disable/re-enable cycle and re-creation keeps a stable id.
- Every preference mutation runs monitoring maintenance (ensure on create, cleanup on delete) synchronously in the same request — see ADR 0030.
- Creating a preference for a stream that is already live and matching returns success like any other create and produces no notification; ADR 0008's future-transitions-only semantics are unchanged.

## Consequences

- Clients can blindly re-submit creates and deletes; the worst case is a refreshed row.
- Disabled preference rows accumulate; any future consumer matching preferences (T-008) must filter `disabled_at IS NULL`, same as push subscriptions (ADR 0027).
- `category_name` is denormalized at selection time and only refreshed by re-creating the same preference; a Twitch-side rename can leave a stale display name until then.
- Global preference creation cost scales with the user's follow count (monitoring ensure touches every followed broadcaster); acceptable at MVP scale, revisit if it becomes slow.
