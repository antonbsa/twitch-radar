# Stream Alerts Notification POC

Small PWA proof of concept for Web Push notifications. It does not connect to Twitch. The channel names are fixed fixtures, and each option schedules a backend timer before sending a push notification.

## Requirements

- Node.js 24+
- npm
- HTTPS tunnel for iPhone testing, such as Cloudflare Tunnel or ngrok

## Setup

```sh
npm install
cp .env.example .env
npm run vapid
```

Copy the generated VAPID keys into `.env`.

This workspace already has local VAPID keys in `.env` for immediate testing.

## Development

```sh
npm run dev
```

Open:

```txt
http://localhost:3000
```

The server exposes:

- `GET /api/config`
- `POST /api/push-subscriptions`
- `POST /api/notifications`
- `GET /api/notifications?subscriptionId=...`

## iPhone Test

1. Start the dev server.
2. Expose it through HTTPS.

Cloudflare Tunnel example:

```sh
cloudflared tunnel --url http://localhost:3000
```

3. Open the HTTPS tunnel URL on the iPhone.
4. Add the app to the Home Screen.
5. Open the installed Home Screen app.
6. Tap `Enable notifications`.
7. Select a channel and tap `Schedule notification`.

The scheduled item appears under `Waiting`. After the configured delay, the backend sends a Web Push notification and the item moves to `Triggered`.

## Scripts

```sh
npm run dev
npm run build
npm run start
npm run typecheck
npm run vapid
```
