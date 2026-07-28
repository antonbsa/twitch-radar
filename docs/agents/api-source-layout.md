# API Source Layout (`apps/api/src/`)

Read this when working inside `apps/api/src` — it's the file map for the Worker backend. Not needed for frontend-only or docs/spec work.

```
env.ts                        — Env bindings, HonoEnv (Bindings + Variables), parseEnv
index.ts                      — Hono app, middleware, sub-router, ExportedHandler; notFound checks
                                app.routes for 405 vs 404; queue() consumes both queues (per-message
                                ack/retry): TWITCH_EVENTS_QUEUE → state processing + notification
                                matching, NOTIFICATION_JOBS_QUEUE → Web Push sends; scheduled()
                                dispatches on controller.cron (ADR 0036) — default minutely branch
                                creates pending EventSub subscriptions (ADR 0031)
crons.ts                      — cron expressions for the scheduled jobs, mirrored in wrangler.jsonc's
                                triggers.crons; own module so tests can import them
types.ts                      — queue message contracts (TwitchEventQueueMessage is a discriminated
                                union on eventType, ADR 0032; NotificationJobMessage carries the
                                {title, body, url} payload, ADR 0034) + EventSub event wire shapes
db/
  client.ts                   — drizzle factory (no singleton)
  index.ts                    — Database class (wires all repositories)
  schema.ts                   — Drizzle table definitions
  repositories/
    users.ts                  — UsersRepository
    push-subscriptions.ts     — PushSubscriptionsRepository
    twitch-tokens.ts          — TwitchTokensRepository (encrypted access/refresh tokens;
                                refresh_failed_at flags dead refresh tokens for reconnect, ADR 0036)
    notification-deliveries.ts — NotificationDeliveriesRepository; insertPendingIfNew dedupes on the
                                (user, broadcaster, category, trigger, stream) unique index and
                                returns the row owning the key; statuses pending → sent/failed/
                                skipped (ADRs 0008, 0034)
    followed-channels.ts      — FollowedChannelsRepository
    channel-state.ts          — ChannelStateRepository; inArray queries batch at 100 (D1 limit);
                                updated_from_event_at backs the stale-event guard (ADR 0033)
    channel-state-changes.ts  — ChannelStateChangesRepository; insertIfNew no-ops on duplicate
                                eventsub_message_id (idempotency key, ADR 0033)
    channel-category-preferences.ts — ChannelCategoryPreferencesRepository (soft-disable via
                                disabled_at, revive on re-create; ADR 0029)
    global-category-preferences.ts — GlobalCategoryPreferencesRepository (same lifecycle)
    monitored-channels.ts     — MonitoredChannelsRepository (broadcaster-keyed, soft-disable;
                                ADR 0030)
    eventsub-subscriptions.ts — EventsubSubscriptionsRepository; ensurePending stages local
                                "pending" rows; findPending/markCreated/markVerified/markRevoked
                                drive the status lifecycle (ADR 0031)
http/
  errors.ts                   — ApiError, errorResponse
  response.ts                 — jsonResponse, getRequestId
  middleware/
    auth.ts                   — requireAuth (session cookie → userId + sessionId on context)
  routes/
    health.ts                 — handleHealth
    auth.ts                   — handleAuthStart, handleAuthCallback, handleLogout
    channels.ts               — handleGetFollowedChannels
    categories.ts             — handleSearchCategories (proxies Twitch category search with the
                                user's token)
    preferences.ts            — handleGetPreferences, handleCreate/DeleteChannelPreference,
                                handleCreate/DeleteGlobalPreference; idempotent create,
                                soft-disable delete, monitoring maintenance inline (ADRs 0029–0030)
    me.ts                     — handleGetMe; adds twitch_reconnect_required (dead/missing refresh
                                token, ADR 0036) to the user payload
    push-subscriptions.ts     — handleGetVapidPublicKey, handleCreatePushSubscription (idempotent
                                upsert by endpoint), handleDeletePushSubscription (soft revoke);
                                lifecycle contract in ADR 0027
    sync.ts                   — handleSyncFollows
    webhooks.ts               — handleEventsubWebhook (HMAC verify against raw body, challenge/
                                revocation handling, KV message-id dedupe, enqueue; ADR 0032)
    _tests.ts                  — handleTestReset, handleTestSeed, handleTestInspect (reads
                                broadcaster-keyed monitoring state); test-seam shared by both test
                                tiers (tests/api and tests/web/e2e via tests/shared/seam-client.ts).
                                Only registered on the router at all when environment !== "production"
                                (see index.ts, ADR 0025) — no separate guard/token to bypass
services/
  crypto.ts                   — encryptToken, decryptToken (AES-256-GCM via Web Crypto)
  session.ts                  — createSession, getSession, deleteSession, deleteSessionsForUser,
                                OAuth state helpers
  monitoring.ts               — ensureMonitoredBroadcasters (upsert monitored_channels, stage
                                pending eventsub rows, fill-only channel_state seeding),
                                cleanupMonitoringForBroadcasters (ADR 0030), and
                                eventsubCallbackUrl (reconciliation's ownership marker, ADR 0036)
  eventsub/
    verify.ts                 — verifyEventsubSignature (HMAC-SHA256 over id+timestamp+raw body,
                                constant-time compare; ADR 0032)
    subscriptions.ts          — createPendingEventsubSubscriptions (cron-driven Twitch-side
                                creation of staged pending rows; ADR 0031)
    process.ts                — processTwitchEventMessage (queue consumer logic: stale guard,
                                channel_state upsert, relevant channel_state_changes; ADR 0033);
                                returns the message's change row so matching can run on it
    reconcile.ts              — reconcileEventsubSubscriptions (cron-driven repair of local rows
                                vs Twitch, scoped to this deployment's callback URL; ADR 0036)
  notifications/
    match.ts                  — matchAndCreateDeliveries (per-channel + follower-scoped global
                                preference matching, staged pending deliveries + send jobs;
                                ADRs 0007, 0008, 0034)
    deliver.ts                — deliverNotification (jobs-queue consumer: sends to active push
                                subscriptions, resolves delivery status, revokes 404/410
                                endpoints; ADRs 0034, 0035)
  push/
    web-push.ts               — sendWebPush (RFC 8291 aes128gcm encryption + RFC 8292 VAPID on
                                WebCrypto — the web-push npm package needs Node APIs the Worker
                                lacks and is kept only for its keygen CLI; ADR 0035)
  twitch/
    client.ts                 — TwitchApiError, exchangeCode, getAuthenticatedUser,
                                getAllFollowedChannels, getAllFollowedStreams, searchCategories,
                                getStreamsByUserIds (batched at 100 user_id params),
                                fetchAppAccessToken, createEventsubSubscription,
                                getAllEventsubSubscriptions, deleteEventsubSubscription
    app-token.ts              — getAppAccessToken (client-credentials token, KV-cached; the test
                                seam evicts it on reset so tests mock their own exchange)
    sync.ts                   — syncFollowedChannels (also re-ensures monitoring for users with
                                active global preferences) and syncStaleFollows (cron-driven daily
                                re-sync for global-preference users; ADR 0036)
    token-refresh.ts          — getValidAccessToken (auto-refresh with 5-min buffer) and
                                refreshExpiringTwitchTokens (cron sweep); 4xx refresh failures set
                                twitch_tokens.refresh_failed_at (ADR 0036)
```
