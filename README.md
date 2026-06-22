# Twitch Category Alerts

Mobile-first PWA for Twitch viewers who want push notifications when followed streamers start streaming specific categories.

The app is designed around Twitch account sync, category preferences, Twitch EventSub webhooks, and Web Push delivery to an installed PWA.

## Goal

Users should be able to:

- connect their Twitch account
- sync followed Twitch channels
- view followed channels with live channels first and ordered by viewer count
- choose categories to be notified about per channel
- choose global categories that apply to any followed channel
- receive a push notification when a followed channel starts streaming or switches into a selected category

## Architecture

The target MVP architecture is serverless:

```txt
Twitch EventSub Webhooks
  -> Cloudflare Worker webhook receiver
  -> Cloudflare Queue
  -> D1 state/preferences lookup
  -> Web Push notification sender
  -> PWA service worker displays notification
```

Primary platform choices:

- Cloudflare Pages for the PWA
- Cloudflare Workers for API routes, Twitch OAuth, EventSub webhooks, and Web Push sending
- Cloudflare D1 for durable relational state
- Cloudflare Queues for async EventSub processing
- Cloudflare KV for short-lived cache
- Cloudflare Secrets for Twitch credentials, VAPID keys, and encryption secrets

The architecture is documented in [spec/mvp/00. architecture.md](spec/mvp/00.%20architecture.md).

## Core Concepts

### Twitch Sync

The app uses Twitch OAuth with `user:read:follows` to sync the user's followed channels.

The followed channel list should merge:

- followed-channel data from Twitch
- live stream state
- viewer count
- current category

Sorting:

1. live channels first
2. live channels by viewer count descending
3. offline channels below

### Preferences

Users can create two kinds of category preferences:

- channel-specific: notify only when a selected channel streams the category
- global: notify when any followed channel streams the category

### Event Processing

The app uses Twitch EventSub webhook subscriptions for monitored broadcasters:

- `stream.online`
- `stream.offline`
- `channel.update`

EventSub subscriptions are tracked globally per unique broadcaster, not per user.

### State Tracking

The app keeps a current `channel_state` snapshot because Twitch EventSub events do not provide enough previous-state context for all notification decisions.

Relevant transitions are stored separately in `channel_state_changes`, such as:

- stream started
- stream ended
- category changed while live
- channel entered a desired category
- channel left a desired category

### Notification Delivery

When an event matches user preferences, the app creates a delivery record and sends Web Push to the user's active push subscriptions.

Deliveries must be deduplicated so the user does not receive repeated notifications for the same channel/category/stream trigger.

## MVP Phases

1. Auth and PWA shell
2. Followed channel sync
3. Category preferences
4. EventSub webhook subscription management
5. Event processing and channel state comparison
6. Web Push notification delivery
7. Reconciliation jobs for EventSub subscriptions and Twitch tokens

## Documentation

- [MVP architecture](spec/mvp/00.%20architecture.md)
- [Project guidance](AGENTS.md)
