# 0036 - Scheduled Ops Jobs: Reconciliation, Token Refresh, Follow Sync

## Status

Accepted

## Context

ADR 0031's minutely cron only creates pending EventSub subscriptions; keeping external state healthy over time (T-008) needs recurring jobs for EventSub reconciliation (repairing drift against Twitch, removing subscriptions for disabled broadcasters — the janitor duties ADRs 0030/0031 defer), proactive Twitch token refresh with a durable reconnect signal, and re-syncing follow lists that global preferences depend on (ADR 0007). Open questions were how multiple jobs share the single `scheduled()` handler and its subrequest budget, how reconciliation avoids clobbering other deployments on the same Twitch application, and how token failure surfaces to the user.

## Decision

**One cron per job**, dispatched on `controller.cron` in `scheduled()` (`src/crons.ts` mirrors `wrangler.jsonc`): pending creation stays every minute as the default branch, reconciliation runs `*/30 * * * *`, token refresh `5,35 * * * *`, follow sync `10 * * * *`. Each job gets its own invocation (own subrequest budget, isolated failures), and tests trigger one job deterministically via `/__scheduled?cron=<expression>`.

**EventSub reconciliation** (`services/eventsub/reconcile.ts`) compares Twitch's subscription list, local `eventsub_subscriptions`, and `monitored_channels`:

- **Ownership guard:** only Twitch subscriptions whose webhook callback equals this deployment's callback URL are considered or deleted — dev/preview/production share one Twitch application and are indistinguishable except by callback.
- Broadcaster disabled → delete the Twitch subscription and the local row (pending rows staged before disablement clean up here too). If the remote delete fails, the row is kept so the pair retries next run.
- Local row whose Twitch subscription is missing, points at a foreign callback, or is in a non-healthy status (anything but `enabled`/`webhook_callback_verification_pending`, which is deleted remotely first) → reset to `pending` for the minutely creation job.
- Status drift (e.g. a missed challenge flip) → mirror Twitch's status locally.
- Owned Twitch subscriptions with no local row → deleted (they spend quota, nothing consumes them); monitored broadcasters missing rows → staged via `ensurePending`. Remote deletes are capped per run (20) for subrequest headroom.

**Token refresh** (`refreshExpiringTwitchTokens`): refreshes tokens expiring within 45 minutes (10 per run, oldest first). A 4xx from the refresh grant means the refresh token is dead: the row is flagged `twitch_tokens.refresh_failed_at` and excluded from future sweeps; 5xx/transient errors just log and retry next run. Request-time refresh (`getValidAccessToken`) sets the same flag on 4xx alongside its existing `reconnect_required` 401. Any successful token upsert (refresh or re-auth) clears the flag. `GET /api/me` exposes `twitch_reconnect_required` (flag set, or token row missing) so the UI can prompt reconnection.

**Follow sync**: for users with an active global preference whose `last_follow_sync_at` is older than 24h, re-run the full `syncFollowedChannels` (3 users per run) so their monitored broadcaster set tracks follow changes without an app visit. Users in reconnect state log and freeze until they return.

## Consequences

- Coverage self-heals end to end: a revoked or lost subscription is back within ~30 minutes plus the minutely creation pickup, without webhooks having to notice.
- Deleting unknown-but-owned Twitch subscriptions means local DB loss deliberately resets external state; foreign-callback subscriptions are never touched.
- Reconciliation loads the full local subscription and monitored-channel tables — fine at MVP scale, needs paging if broadcaster counts grow large.
- A dead refresh token stops being retried; the user sees the reconnect state only when the client reads `/api/me`, there is no push nudge.
- Scheduled follow sync consumes user-token rate limits in the background, bounded by the per-run cap and the 24h staleness gate.
