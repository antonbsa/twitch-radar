# 0007 - Client-Side Notification Digest Not Viable On iOS

## Status

Explored, not adopted

## Related

- [Issue #117](https://github.com/antonbsa/twitch-radar/issues/117) (collapse a burst of notifications into a digest)
- [Issue #118](https://github.com/antonbsa/twitch-radar/issues/118) (`Topic` header on Web Push)
- [ADR 0055](../decisions/0055-client-side-notification-digest.md) (rejected), [ADR 0026](../decisions/0026-manual-service-worker-without-vite-plugin-pwa.md), [ADR 0048](../decisions/0048-notification-snooze-reminders.md)
- [TN 0006](0006-category-art-in-push-notifications-not-justified.md) (other iOS web push rendering limits)
- [apps/web/public/service-worker.js](../../apps/web/public/service-worker.js)

## Question

Can the service worker collapse a burst of alerts for different broadcasters into one digest notification (ADR 0055's design), on the installed iOS PWA where the app is mainly used?

## Findings

Implemented ADR 0055 end to end and tried it by hand on an installed iOS 18.7 PWA, using `npm run mock-eventsub` against a local `wrangler dev` behind a tunnel. Desktop and Android were not tried: desktop doesn't see the problem, and Android has no users or plans.

- **`registration.getNotifications()` lists nothing.** The ADR's rule counts visible alerts through it. A diagnostic suffix on the notification body showed the list was empty (`visible=none`) on every push, including the second and third of a burst, so the threshold was never reached and the worker fell back to one notification per push. The ADR had flagged this as unverified.
- **Own state works, replacement and closing do not.** Keeping the shown alerts (last 5 minutes) in Cache Storage instead made the digest form on iOS, with correct names and ordering ("3 channels live", then "4 channels" with one more). But a later update with the same `tag: "digest"` appeared next to the earlier digest instead of replacing it, and notifications shown earlier can't be closed. A burst ends as the individual alerts before the threshold plus one digest per alert after it.
- **Offline bursts lose pushes at Apple's push service.** With the phone offline, three pushes accepted by Apple (`status: sent`) produced 2 arrivals once, and 1 arrival once, after reconnecting. Pushes sent with the phone online arrived in full. A digest on iOS therefore only sees a burst when the pushes arrive close together online, which isn't the offline case the issue was about. Shrinking the offline burst is #118's job.
- **A push must show a notification.** WebKit expects every push to show one, so a digest can't "absorb" an alert silently on iOS by showing nothing.
- **Existing `tag` behavior.** The per-broadcaster `tag` (issue #38) is the same mechanism that failed to replace here, so its same-broadcaster collapsing is probably also not effective on iOS. Not checked.

## Options considered

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| Count visible notifications via `getNotifications()` (ADR 0055 as written) | No extra state, matches what the user sees | Empty list on iOS, so it never digests there | Rejected |
| Track shown alerts in Cache Storage with a time window | Forms a digest on iOS; works on every platform | Can't replace or close on iOS, counts dismissed notifications until the window ends, ADR rewrite | Rejected, a digest per alert after the threshold isn't a collapse |
| Server-side batching window | One push per burst | Adds latency to every alert, breaks the one-delivery-one-push audit model, can't merge pushes already sent | Rejected (ADR 0055) |
| Leave bursts as they are; shrink the offline case with `Topic` (#118) | Handled at the push service, no worker logic | Doesn't merge across broadcasters | Open, tracked in #118 |

## Conclusion

Not adopted. The feature has to work on the installed iOS PWA, and there the worker can neither list, replace nor close notifications, and offline bursts don't reach it whole. The remaining platform that could show a clean digest (desktop Chrome) isn't where the app is used, and Android has no users. Issue #117 and ADR 0055 are closed out without code.

## If we revisit this

If iOS web push starts listing notifications through `getNotifications()` and replacing by `tag`, or usage moves to desktop or Android, the Cache Storage variant is the one already known to work (state keyed by broadcaster with a ~5 minute window, a ~10s silent-update window, `kind: "alert" | "reminder"` in the payload so reminders stay out). Check `getNotifications()` and `tag` replacement on a real installed iOS PWA first, with the phone online, before any code. A server-side window stays rejected for the reasons in ADR 0055.
