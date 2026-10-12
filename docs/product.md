# Product

What Twitch Radar is for, who uses it, how it behaves, and what it deliberately doesn't do. For how it's built see the [architecture decisions](decisions/README.md); for running it locally see [development.md](development.md).

## The Problem

Twitch tells you when a followed channel goes live, but not when a streamer you follow switches to the thing you actually want to watch. A variety streamer who plays Minecraft on Mondays and Just Chatting the rest of the week is "live" all the time, and the generic go-live ping says nothing about what they are doing right now. The result is a choice between muting everything and missing the stream you cared about.

Twitch Radar notifies you about a **category**, not just a channel: "tell me when anyone I follow starts Elden Ring, or when this one streamer switches into Minecraft."

## Who It's For

Twitch viewers who follow many channels and care about specific games or topics more than about specific people. It's built mobile-first: the primary platform is the installed PWA on an iPhone, with desktop browsers and Android as secondary targets.

## Core Flows

- **Sign in with Twitch.** There are no separate accounts: Twitch is the only login, and the app reads your follows with it.
- **See who you follow, like Twitch's sidebar.** Live channels first, ordered by viewer count, then offline ones. Each live channel shows its current category and how long it has been there. Follows sync on first login and in the background afterwards, and a Sync button forces a refresh.
- **Choose what to be notified about.** Two kinds of alert, both per category:
  - _Per channel_: notify me when this channel is in this category.
  - _Global_: notify me when any channel I follow is in this category, optionally excluding specific channels.
- **Receive a push notification.** Enable notifications from the Account tab. A tap opens the channel; on platforms that support notification actions you can also snooze.
- **Stay in control.** Pause all notifications, mute a single channel, exclude channels from a global alert, or snooze a channel for 15 minutes from its detail view.
- **Pick a language and see what's new.** The UI ships in English, Spanish and Brazilian Portuguese, and the Account tab shows the changelog.

| Channels | Alerts | Account |
| --- | --- | --- |
| ![Channels tab](images/channels.png) | ![Alerts tab](images/alerts.png) | ![Account tab](images/account.png) |

## What A Notification Means

A notification says: **a channel you follow is live right now, in a category you asked about, and that just became true.** It is sent when a followed channel starts streaming in a matching category, or switches into one while live ([ADR 0008](decisions/0008-send-category-notifications-only-for-future-matching-transitions.md)). If both a per-channel and a global alert match, you get one notification.

A snooze reminder is the one exception: you asked to be told again, so it re-checks the channel's state when it fires and notifies only if the channel is still live in that category ([ADR 0048](decisions/0048-notification-snooze-reminders.md)).

## When A Notification Is Not Sent

- **Nothing changed.** Creating an alert for a stream that is already live in that category doesn't notify; only a future transition does ([ADR 0008](decisions/0008-send-category-notifications-only-for-future-matching-transitions.md)).
- **The stream isn't a live broadcast.** Reruns, playlists and watch parties are ignored, since the premise of the notification wouldn't be true ([ADR 0051](decisions/0051-suppress-non-live-stream-type-notifications.md)).
- **You suppressed it.** Pause all, a muted channel, or a global-alert exclusion each drop the notification ([ADR 0054](decisions/0054-user-controlled-notification-suppression.md)).
- **You were just notified about that channel.** At most one notification per channel every 15 minutes, whatever the category, so a streamer who reconnects or cycles through categories doesn't flood you ([ADR 0056](decisions/0056-send-side-notification-cooldown.md)). Snooze reminders are exempt.
- **The channel went offline, or changed category while offline.**
- **Your Twitch connection needs renewing.** The app asks you to sign in again; alerts resume afterwards.

## Non-Goals

- **Not a Twitch client.** It doesn't play streams, show chat or replace the Twitch app: a notification or the channel's detail view links out to Twitch.
- **No digest or batching of notifications.** Collapsing a burst into one notification was tried and rejected because installed iOS PWAs can't support it ([ADR 0055](decisions/0055-client-side-notification-digest.md), [TN 0007](notes/0007-client-side-notification-digest-not-viable-on-ios.md)).
- **No polling and no app that must stay open.** Twitch pushes events to the backend, which pushes to your device.
- **No other login providers, no other platforms' streams.**
- **No per-user tuning of timing.** Snooze and cooldown are fixed at 15 minutes.

## v1 Scope

The first stable release covers the flows above: Twitch sign-in, follow sync, per-channel and global category alerts, Web Push delivery on the installed PWA, pause/mute/exclusions/snooze, three UI languages and in-app release notes. Anything not listed here is out of scope until an issue and, where it changes a decision, an ADR say otherwise.
