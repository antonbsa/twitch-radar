# 0004 - Use Twitch EventSub Webhooks

## Status

Accepted

## Context

Twitch EventSub can deliver notifications through either webhook transport or WebSocket transport. The MVP platform target is serverless, where persistent outbound WebSocket listeners do not fit the request lifecycle.

Relevant Twitch references:

- https://dev.twitch.tv/docs/eventsub/
- https://dev.twitch.tv/docs/eventsub/handling-webhook-events/
- https://dev.twitch.tv/docs/eventsub/handling-websocket-events/
- https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#streamonline
- https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#streamoffline
- https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channelupdate

## Decision

Use Twitch EventSub webhook transport for the MVP.

Do not use an EventSub WebSocket listener for serverless deployment.

Subscribe to these EventSub event types for monitored broadcasters:

- `stream.online`
- `stream.offline`
- `channel.update`

Webhook handlers must:

- verify Twitch HMAC signatures with the raw request body;
- handle callback verification challenges;
- dedupe by Twitch EventSub message ID;
- enqueue processing work;
- respond quickly with a `2XX` response after accepted validation.

## Consequences

- The Worker must preserve raw webhook bodies for signature verification.
- Async processing belongs in Cloudflare Queues.
- `stream.online` and `channel.update` are both required because neither alone covers all category-notification cases.
