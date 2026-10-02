# 0006 - Category Art In Push Notifications Not Justified

## Status

Explored, not adopted

## Related

- [Issue #25](https://github.com/antonbsa/twitch-radar/issues/25) (broadcaster avatar as the notification `icon`; kept as is)
- [Issue #77](https://github.com/antonbsa/twitch-radar/issues/77) (box art on Alerts page chips; owns any box art persistence)
- [ADR 0026](../decisions/0026-manual-service-worker-without-vite-plugin-pwa.md), [ADR 0048](../decisions/0048-notification-snooze-reminders.md)
- [apps/api/src/services/notifications/match.ts](../../apps/api/src/services/notifications/match.ts), [apps/web/public/service-worker.js](../../apps/web/public/service-worker.js)

## Question

Should a push notification show the category visually (Twitch box art) next to the broadcaster's avatar, so it's identifiable at a glance by who is streaming and what?

## Findings

- **Current payload.** `image` carries the stream's resolved `thumbnail_url` (`match.ts`, `snooze-sweep.ts`); `icon`/`badge` are the generic `/icon.svg`. The category name is already in the notification title (`params.categoryName`). Issue #25 already plans the broadcaster avatar as `icon`.
- **Box art isn't stored.** Only `category_name` is persisted on `channel_category_preferences`/`global_category_preferences`; `box_art_url` exists only transiently in the category search route. Any notification use would first need a persistence path, the same gap #77 has.
- **Platform rendering (Web Notifications):**
  - iOS/iPadOS web push ignores `icon` and `image` and always shows the installed PWA's app icon, so no per-notification visual reaches iPhone users.
  - Android renders `badge` as a monochrome alpha mask, so box art there becomes a silhouette.
  - Chrome on macOS ignores `image` and shows `icon` only, small, on the right.
  - Android, Windows and ChromeOS show `image` large when the notification is expanded.
- **Thumbnail vs box art.** The live stream thumbnail carries more information than a static box art, which only restates the category the title already names.
- **Composite icon.** Overlaying box art on the avatar is the only way to show both in the small `icon` slot, but it needs server-side image generation in the Worker (Cloudflare Images binding or a wasm library), plus caching and handling of expiring source URLs.
- **Primary usage is iPhone**, where none of the above options are visible.

## Options considered

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| Category only in the title text; avatar as `icon` via #25; thumbnail stays as `image` | No new work beyond #25, degrades gracefully | No visual category cue | Adopted |
| Box art as `image`, replacing the thumbnail | Glanceable "what" on Android/Windows/ChromeOS | Loses the live preview; invisible on iOS and macOS; needs box art persistence | Rejected |
| Box art as `image` only for `switched_into_category`, thumbnail for `went_live` | Highlights the event where the category is the news | Same visibility gaps and persistence cost as above | Rejected |
| Box art as `badge` | Small, always-on slot | Android renders it as a monochrome silhouette | Rejected |
| Composite avatar + box art `icon` generated server-side | Shows both in the slot macOS uses | Image pipeline in the Worker for a cue that never reaches iOS | Rejected |

## Conclusion

Not adopted. The category already appears in the title, the thumbnail is the more informative image, and every visual option is invisible on iOS, where the app is mainly used. Issue #25 stays unchanged, including its notification-avatar criterion: it's a few lines once the avatar exists and falls back to `/icon.svg`.

## If we revisit this

If usage shifts to Android or desktop, or iOS web push starts honoring `icon`/`image`, the cheapest option is box art as `image` for `switched_into_category` only, once #77 has persisted `box_art_url`. Don't use `badge` for it, and treat a composite icon as a separate image-pipeline decision (ADR).
