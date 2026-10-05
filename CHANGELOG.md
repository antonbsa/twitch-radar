# Changelog

What changed for people using Twitch Radar, one section per released version. Written in plain language for the in-app "What's New" sheet — no PR numbers, commit prefixes, or internal-only changes; the full engineering list lives in each GitHub Release, generated from PR labels below this entry (see [ADR 0050](docs/decisions/0050-changelog-as-source-of-truth-for-release-notes.md)). An `## Unreleased` section, when present, is ignored by the widget and its build-time parser.

## v0.3.0 — 2026-10-04

Notifications get a lot more useful: channel pictures, a Watch button, and text that actually tells you what changed.

### New

- Notifications now have a "Watch" button that opens the channel on Twitch, and can show a preview of the stream.
- Notifications, the channel list, and channel details now show the streamer's profile picture.
- A "What's New" sheet shows what changed in each version, and you can open it from the version number in the app.

### Improved

- Notification text now says something new, such as how long the channel has been live, what it was playing before, or the stream title, instead of repeating the headline.
- Several alerts in a row from the same channel now replace each other instead of piling up.
- Your followed channels now sync automatically when you open the app or come back to it after a while.
- The category filter on Channels shows how many channels are live in each category.
- Searching for a category or adding a channel now opens a full-screen view that stays clear of the keyboard, with your saved categories listed first.
- The app now confirms when a setting is saved or a change fails.

### Fixed

- Reruns, playlists, and watch parties no longer send alerts as if the channel had just gone live.
- The bottom tab bar and sheets no longer sit under the iPhone home indicator, and lists no longer scroll behind the tab bar.

## v0.2.0 — 2026-09-28

Twitch Radar is now available in Spanish and Brazilian Portuguese, alongside a redesigned Alerts page and new ways to react to live notifications.

### New

- The app and push notifications are now available in Spanish and Brazilian Portuguese, in addition to English.
- Tapping a followed channel opens a detail view with its latest snapshot, title, category, and viewer count, with a direct link to watch on Twitch.
- The channels list can now be searched, filtered, and sorted.
- The Alerts page has been redesigned, grouping notification settings by channel for easier management.
- When a followed channel is live, you can turn on notifications for its current category with one tap, and you're prompted to enable push if it isn't already on.
- Notifications now offer a "Remind me in 15m" option instead of only being dismissible.

### Improved

- Notifications are more reliable to set up, recovering automatically from setup issues that could previously keep them from firing.

## v0.1.1 — 2026-08-30

### Improved

- Syncing your followed channels is faster.
- A short cooldown between syncs keeps repeated taps from starting the same sync twice.

### Fixed

- Cancelling the Twitch sign-in screen now brings you back to the login page with a clear message instead of an error.
- When your Twitch connection needs to be renewed, the app tells you as soon as the page loads.

## v0.1.0 — 2026-07-31

The first release of Twitch Radar.

### New

- Sign in with your Twitch account, and your followed channels are synced automatically.
- Choose the game categories you care about, for all channels or for specific ones.
- Get a push notification when a channel you follow goes live in one of those categories.
- Install Twitch Radar on your phone or computer as an app.
