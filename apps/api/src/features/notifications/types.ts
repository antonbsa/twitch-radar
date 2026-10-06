import type { Language } from "../../db/repositories/users"

// Shared web-push payload contract. The service worker resolves the title/body
// keys using the recipient locale and includes broadcaster/category identifiers
// so a notification click can schedule a reminder without referencing a delivery.
export interface NotificationPayload {
  titleKey: string
  // Optional so a title-only notification (no informative body to show) is
  // representable — the service worker must not fall back to generic body
  // text when this is absent (see item 4/redundancy fix, issue #38).
  bodyKey?: string
  params: Record<string, string>
  lang: Language
  url: string
  broadcasterUserId: string
  categoryId: string
  // Twitch login for the service worker's "Watch" action, which opens
  // twitch.tv/{login} directly rather than the app's own deep link. Absent
  // when the login isn't on hand (e.g. monitored_channels row not backfilled
  // yet) — the action is omitted rather than linking a broken URL.
  broadcasterLogin?: string
  // Stream thumbnail shown as the notification's `image`; omitted entirely
  // when there is none rather than sent as null (issue #38 item 6).
  image?: string
  // Broadcaster avatar shown as the notification's `icon`; omitted when none
  // is stored, so the service worker falls back to the app icon (issue #25).
  icon?: string
}

// Queue payload contract for NOTIFICATION_JOBS_QUEUE (ADR 0034). The payload
// is computed at match time (the matcher holds the change row and broadcaster
// names); the delivery row referenced by `deliveryId` is the dedupe/audit
// record and its `pending` status gates the actual send.
export interface NotificationJobMessage {
  deliveryId: string
  userId: string
  payload: NotificationPayload
}
