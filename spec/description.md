## Description

a PWA-based mainly for iOS for users to set the preferred categories from their followed channels, receiving notifications when they started streaming it

## Technical

- listen to `twitch channel.update` event > compare to previous data

## Features

- sync with user's twitch account
- notify user when a streamer started streaming a specific category
- list all user's followed twitch channels, order by 1. live and 2. most viewers (similarly to twitch's panel)
