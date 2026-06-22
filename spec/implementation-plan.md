# Notification-Only POC Implementation Plan

## Goal

Build a small PWA that proves the core notification flow:

1. User opens the PWA on an iPhone.
2. User enables notifications.
3. User selects one predefined Twitch-like channel option.
4. Backend waits for the configured delay.
5. Backend sends a Web Push notification.
6. The installed PWA receives and displays the notification on iOS.

This POC intentionally does not connect to Twitch. Channel names and delays are static test fixtures.

## Scope

### Included

- Mobile-only PWA UI.
- Service worker registration.
- Push subscription creation.
- Backend endpoint to store push subscriptions.
- Backend endpoint to schedule test notifications.
- In-memory or local JSON file storage.
- List of pending notifications first.
- List of triggered notifications below pending items.
- Simple visual distinction for triggered notifications.

### Excluded

- Twitch OAuth.
- Twitch channel/category search.
- Twitch EventSub.
- User accounts.
- Database setup.
- Background sync.
- Notification retries beyond basic error handling.
- Multi-device account synchronization.

## Recommended Stack

### Backend

- Node.js
- TypeScript
- Fastify
- `web-push`
- `zod`
- `nanoid`
- Local JSON file storage under `data/`

Fastify is small, fast, and simple enough for a POC. `web-push` handles VAPID-based browser push delivery.

### Frontend

- Plain HTML
- Plain CSS
- Plain JavaScript
- `manifest.webmanifest`
- `service-worker.js`

No frontend framework is needed for this POC. The UI is small and mostly state-driven around one select input and one list.

## Predefined Channel Options

Use a fixed list of five options:

```js
[
  { id: "zigueira-60", label: "ziGueira", delaySeconds: 60 },
  { id: "alanzoka-15", label: "Alanzoka", delaySeconds: 15 },
  { id: "gaules-30", label: "Gaules", delaySeconds: 30 },
  { id: "casimito-45", label: "Casimito", delaySeconds: 45 },
  { id: "cellbit-90", label: "Cellbit", delaySeconds: 90 }
]
```

The UI should display labels as:

- `ziGueira (60s)`
- `Alanzoka (15s)`
- `Gaules (30s)`
- `Casimito (45s)`
- `Cellbit (90s)`

## User Flow

1. User opens the PWA.
2. App checks service worker and push support.
3. User taps `Enable notifications`.
4. Browser prompts for notification permission.
5. App creates a push subscription and sends it to the backend.
6. User selects one channel from the predefined input.
7. User taps `Schedule notification`.
8. Backend creates a pending notification with a trigger time.
9. UI shows the item in the pending section.
10. Backend timer fires after the channel delay.
11. Backend sends a push notification to the user's subscription.
12. Backend marks the notification as triggered.
13. UI refreshes and moves the item into the triggered section.

## UI Requirements

### Layout

Mobile-first single-column layout:

```text
[ App title ]

[ Enable notifications button / status ]

[ Channel select input       v ]

[ Schedule notification button ]

Waiting
- ziGueira
  Fires in 60s

Triggered
- Alanzoka
  Fired at 14:32
```

### Components

- Notification permission/status block.
- Single channel select input.
- Schedule button.
- Pending notification list.
- Triggered notification list.

### States

Schedule button is enabled only when:

- Notifications are supported.
- Notification permission is granted.
- Push subscription has been saved by the backend.
- A channel option is selected.

Pending items:

- Normal contrast.
- Show channel label.
- Show scheduled trigger time or remaining seconds.

Triggered items:

- Lower contrast.
- Gray background or muted border.
- Show fired timestamp.

## Backend API

### `GET /api/config`

Returns public app config.

Response:

```json
{
  "vapidPublicKey": "...",
  "channels": [
    {
      "id": "zigueira-60",
      "label": "ziGueira",
      "delaySeconds": 60
    }
  ]
}
```

### `POST /api/push-subscriptions`

Stores or replaces a push subscription.

Request:

```json
{
  "subscription": {
    "endpoint": "...",
    "keys": {
      "p256dh": "...",
      "auth": "..."
    }
  }
}
```

Response:

```json
{
  "subscriptionId": "..."
}
```

For the POC, one active subscription per browser is enough. Store the returned `subscriptionId` in `localStorage`.

### `POST /api/notifications`

Schedules a test notification.

Request:

```json
{
  "subscriptionId": "...",
  "channelId": "alanzoka-15"
}
```

Response:

```json
{
  "notification": {
    "id": "...",
    "channelId": "alanzoka-15",
    "channelLabel": "Alanzoka",
    "delaySeconds": 15,
    "status": "waiting",
    "createdAt": "2026-06-21T20:30:00.000Z",
    "scheduledFor": "2026-06-21T20:30:15.000Z",
    "triggeredAt": null
  }
}
```

### `GET /api/notifications?subscriptionId=...`

Returns notifications for the current subscription.

Response:

```json
{
  "notifications": [
    {
      "id": "...",
      "channelId": "alanzoka-15",
      "channelLabel": "Alanzoka",
      "delaySeconds": 15,
      "status": "waiting",
      "createdAt": "2026-06-21T20:30:00.000Z",
      "scheduledFor": "2026-06-21T20:30:15.000Z",
      "triggeredAt": null
    }
  ]
}
```

Sort order:

1. Waiting notifications first, nearest `scheduledFor` first.
2. Triggered notifications below, newest `triggeredAt` first.

## Data Model

### Subscription

```ts
type PushSubscriptionRecord = {
  id: string;
  subscription: PushSubscriptionJSON;
  createdAt: string;
  updatedAt: string;
};
```

### Notification

```ts
type NotificationRecord = {
  id: string;
  subscriptionId: string;
  channelId: string;
  channelLabel: string;
  delaySeconds: number;
  status: "waiting" | "triggered" | "failed";
  createdAt: string;
  scheduledFor: string;
  triggeredAt: string | null;
  errorMessage?: string;
};
```

## Push Payload

Payload sent by backend:

```json
{
  "title": "Alanzoka is live",
  "body": "Test notification fired after 15 seconds.",
  "url": "/"
}
```

Service worker behavior:

- Listen for `push`.
- Parse payload.
- Call `self.registration.showNotification(title, options)`.
- Listen for `notificationclick`.
- Focus an existing client if available.
- Otherwise open `/`.

## Local Development

1. Generate VAPID keys once.
2. Save them in `.env`.
3. Start the Fastify server.
4. Serve the static frontend from the same origin.
5. Expose HTTPS for iPhone testing with a tunnel.

Example environment variables:

```env
PORT=3000
PUBLIC_BASE_URL=https://example-tunnel-url.trycloudflare.com
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:dev@example.com
```

For iPhone testing, HTTPS is required. The PWA must be opened from the HTTPS tunnel URL and added to the Home Screen before iOS push behavior can be validated as a PWA.

## Implementation Steps

1. Initialize Node/TypeScript project.
2. Add Fastify server.
3. Add static file serving for the frontend.
4. Add VAPID key generation script or documented command.
5. Add JSON file storage helpers.
6. Implement `GET /api/config`.
7. Implement `POST /api/push-subscriptions`.
8. Implement `POST /api/notifications`.
9. Implement timer scheduling for pending notifications.
10. Implement `GET /api/notifications`.
11. Add `manifest.webmanifest`.
12. Add `service-worker.js`.
13. Build mobile HTML/CSS UI.
14. Add frontend state handling for permission, subscription, channel selection, and scheduling.
15. Add polling for notification list refresh every few seconds.
16. Test locally in desktop Chrome.
17. Test through HTTPS tunnel on iPhone.
18. Add Home Screen install instructions to README.

## Timer Behavior

For the POC, `setTimeout` is acceptable.

Limitations:

- Timers are lost if the backend process restarts.
- Already scheduled notifications need to be rehydrated from JSON if restart support is wanted.

Recommended POC behavior:

- On server start, load waiting notifications from JSON.
- If `scheduledFor` is in the future, schedule a new timer.
- If `scheduledFor` is in the past, mark as failed or trigger immediately.

## Acceptance Criteria

- User can open the app on mobile.
- User can grant notification permission.
- User can subscribe to push.
- User can select one of five predefined channel options.
- Schedule button is disabled until app is ready and a channel is selected.
- Scheduled notification appears in the waiting list.
- Waiting list appears above triggered list.
- Backend sends a push notification after the selected delay.
- PWA displays the notification on iPhone.
- Triggered notification moves to the gray/old section.
- No Twitch API credentials are required.

## Risks

- iOS requires the PWA to be installed to the Home Screen for real PWA push behavior.
- Notification permission can only be requested from a user gesture.
- Push does not work from plain HTTP on real devices.
- Local tunnel URL changes can invalidate testing shortcuts.
- Backend process restarts may lose pending in-memory timers unless rehydrated from JSON.

## Recommended File Structure

```text
.
├── package.json
├── tsconfig.json
├── .env.example
├── data/
│   ├── subscriptions.json
│   └── notifications.json
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── manifest.webmanifest
│   └── service-worker.js
└── src/
    ├── server.ts
    ├── channels.ts
    ├── storage.ts
    ├── push.ts
    └── notifications.ts
```
