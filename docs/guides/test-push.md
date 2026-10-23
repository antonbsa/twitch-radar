# Test Push Notifications

Receive a real Web Push notification from your local setup, on the dev machine or a phone. This needs the VAPID keys from [run-locally](run-locally.md#add-your-credentials).

1. Start the app with `npm run dev` (restart it if you just added the keys).
2. In the app, open the Account tab and enable notifications. This grants the browser permission and creates a real push subscription.
3. Add a category preference: a channel preference from the Channels tab, or a global one.
4. Force a notification without waiting for a broadcaster to change category:
   ```sh
   npm run mock-eventsub
   ```

Your device should get the push, and the script prints the resulting `notification_deliveries` row.

## Choose The Target

With no arguments, `mock-eventsub` reads this worktree's local D1 and targets the most recently logged-in user and their oldest active channel preference. With only a global preference, it uses the first channel they follow that is monitored. Set `MOCK_USER_ID` (environment or `.env.local`) to pick another user.

Arguments override the derived target:

```sh
npm run mock-eventsub -- <broadcasterUserId> <categoryId> "<categoryName>" [<baselineCategoryId> "<baselineCategoryName>"]
# switch a broadcaster from Minecraft to Just Chatting
npm run mock-eventsub -- 123456789 509658 "Just Chatting" 27471 Minecraft
```

The script sends a signed `channel.update` webhook straight to your local API. No Twitch call is made, and it only works while `ENVIRONMENT` is not `production`, which holds for every local setup.

## If Nothing Arrives

`vapid_not_configured` from the API means the VAPID keys are still the placeholders or not a valid pair: run `npm run vapid`, copy the keys into `.env.local` and restart `npm run dev`. On a phone, see [test-on-phone](test-on-phone.md#when-something-fails).
