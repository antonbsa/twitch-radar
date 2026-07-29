# 0003 - EventSub Subscription Cost of Broadening Monitoring Scope

## Status

Deferred

## Related

- [Issue #21 draft - Followed channels without a preference aren't monitored](../../.agents/issues/21-followed-channels-without-preference-not-monitored.md)
- [Issue #20 draft - Periodic viewer-count refresh cron](../../.agents/issues/20-periodic-viewer-count-refresh-cron.md)
- [TN 0001 - Viewer Count Freshness and Rate-Limit Scalability](0001-viewer-count-freshness-and-rate-limit-scalability.md)
- [TN 0002 - Viewer Count Cron Sufficiency for Twitch-Like Freshness](0002-viewer-count-cron-sufficiency-for-twitch-like-freshness.md)
- [ADR 0007 - Monitor broadcasters globally across users](../decisions/0007-monitor-broadcasters-globally-across-users.md)
- [ADR 0030 - Monitored-broadcaster lifecycle and state seeding](../decisions/0030-monitored-broadcaster-lifecycle-and-state-seeding.md)
- [ADR 0036 - Scheduled ops jobs](../decisions/0036-scheduled-ops-jobs.md)
- [apps/api/src/services/eventsub/subscriptions.ts](../../apps/api/src/services/eventsub/subscriptions.ts)
- [apps/api/src/db/repositories/eventsub-subscriptions.ts](../../apps/api/src/db/repositories/eventsub-subscriptions.ts)

## Question

TN 0001/0002 established that the `Get Streams` (viewer_count) polling path has large rate-limit
headroom. Separately, the "remove Sync button, fully auto-synced list" goal (issue #21) requires
monitoring — and therefore creating EventSub subscriptions for — every followed channel, not
just the smaller subset with an active preference (today's scope, per ADR 0007). Does *that*
change (EventSub subscription volume, not `Get Streams` polling volume) have the same kind of
headroom, or does it hit different, more binding constraints? At what practical scale (10 users?
1,000 users?) would this become a real problem, and can the tradeoffs be designed around?

## Findings

**Twitch's EventSub subscription cost model is different from the `Get Streams` rate-limit
bucket TN 0001/0002 analyzed, and does not have the same obvious headroom.** Per
[Twitch's subscription management docs](https://dev.twitch.tv/docs/eventsub/manage-subscriptions/):

> "There is a cost for subscriptions that require you to specify a user but does not require
> that user to authorize your application (e.g., `stream.online`, `channel.update`). However,
> there is no cost if that user has authorized your application."
>
> "The maximum number of subscriptions you can create grows as users authorize your
> application."

Concretely: `stream.online`, `stream.offline`, `channel.update` each cost 1 point against the
app's `max_total_cost`, **unless the broadcaster in the subscription's own condition has
authorized this app** — i.e. unless the *streamer being watched* is themselves a registered
twitch-radar user. For essentially every followed broadcaster (people are watched, not using
the app), this exemption doesn't apply, so cost is the full 1 point per subscription type.

Twitch does **not** publish the starting `max_total_cost` value or its exact growth formula —
only that it grows as users authorize (register in) the app, not as those users follow more
channels. This is the crux of the asymmetry: today's monitored set ("broadcasters with an
active preference") is a small, curated subset per user; broadening to "every distinct
broadcaster anyone follows" is typically 10-50x larger (most users configure preferences for
only a few of the many channels they follow), so the cost side would grow much faster than the
ceiling that's supposed to absorb it — unlike `Get Streams`, where cost is bounded by a
100-per-request batch regardless of count.

**Cloudflare Workers' subrequest limit already forced a hard per-run cap in this codebase,
independent of any Twitch-side ceiling.** [`subscriptions.ts`](../../apps/api/src/services/eventsub/subscriptions.ts:6-9):

```
// One Twitch call per row plus the token fetch must stay well under the
// Workers subrequest limit (50 on the free plan); the next scheduled run
// picks up whatever is left.
const MAX_CREATES_PER_RUN = 30
```

At 3 subscription types/broadcaster (today's uniform model), that's 10 new broadcasters/minute
of actual subscription-creation throughput. A large one-time jump in monitored-broadcaster
count (e.g. promoting an entire existing follow graph at once) would take hours, not minutes,
to fully establish push coverage for — a real, code-enforced throughput ceiling, separate from
the Twitch-side cost ceiling above.

**Already-acknowledged debt compounds this.** [ADR 0036](../decisions/0036-scheduled-ops-jobs.md)'s
Consequences section: "Reconciliation loads the full local subscription and monitored-channel
tables — fine at MVP scale, needs paging if broadcaster counts grow large." Broadening
monitoring scope is exactly the kind of change that pushes broadcaster counts past that stated
assumption.

**A tiered subscription model reduces the Twitch-side cost without losing functionality.**
`channel.update`'s only consumer today is notification matching (ADR 0034) — a broadcaster with
no active preference has nothing to match against, so subscribing to `channel.update` for it is
pure cost with no function. Splitting monitoring into two tiers — broadcasters with an active
preference get all 3 subscription types (unchanged), followed-only broadcasters get only
`stream.online`/`stream.offline` (2 types) — cuts the marginal per-broadcaster cost of the
much-larger unmonitored-but-followed set from 3 points to 2. Category/title freshness for that
tier isn't actually lost: [issue #20](../../.agents/issues/20-periodic-viewer-count-refresh-cron.md)'s
periodic `Get Streams` cron already fetches `game_name`/`title` in the same response it uses for
`viewer_count` — writing those fields too (no extra request) passively keeps a live Tier-B
channel's category/title current without needing `channel.update` at all.

**The Cloudflare-side ramp-up ceiling can be made a non-issue for correctness by seeding state
directly first, subscribing asynchronously after.** The existing `syncFollowedChannels` path
already does a direct Twitch fetch (`getAllFollowedChannels` + `getAllFollowedStreams`) to
populate `channel_state` for the whole follow list in one request/response cycle — this is
exactly what the manual "Sync" button does today, and it's independent of EventSub subscription
state. Running that same fetch once at first login/load gives the user a correct initial view
immediately, regardless of how long the minutely subscription-creation job takes to establish
push coverage for the (now much larger) monitored set in the background. This mirrors the
existing fill-only-seed pattern in
[`seedMissingChannelState`](../../apps/api/src/services/monitoring.ts:71), just widened from
"preference-covered" to "all followed." Under this design, the per-run creation cap (finding
above) affects only how soon *future* transitions become push-driven, not whether the initial
view is correct — it stops being a correctness risk and becomes a background-latency detail.

**The one number that matters most (real `max_total_cost` headroom) is measurable directly,
not something that has to be estimated from public docs.** `GET /helix/eventsub/subscriptions`
returns both `total_cost` and `max_total_cost` for the app's real client ID on every call. This
can be queried against the actual production/staging app today to see current headroom, and
re-checked as the registered-user base grows — turning "we don't know when this breaks" into
"here's the real number, measured."

**Directional reasoning on user-count scale (not a measured fact — flagged as such).** Distinct
followed-broadcaster count likely grows sub-linearly with registered-user count: popular
streamers get followed redundantly by many users, so each additional user mostly contributes
"long tail" broadcasters not already monitored, with diminishing new-broadcaster contribution
as the user base grows. This suggests 1,000 users would not mean roughly 1,000x the distinct
broadcasters of 10 users — but this is inference about follow-list distribution shape, not a
number derived from this app's actual data or from anything Twitch publishes.

## Options considered

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| Broaden monitoring to all followed channels uniformly (3 subscription types each) | Simplest to implement; matches existing per-broadcaster model exactly | Highest `max_total_cost` exposure of any option; no functional need for `channel.update` on unpreferenced broadcasters | Not recommended — pays for a capability (notification matching) nothing uses on this tier |
| Tiered subscriptions (2 types for followed-only, 3 for preference-covered) + immediate direct-fetch seed at login + async subscription ramp-up | Achieves real push freshness for online/offline; lowers marginal EventSub cost ~33% on the larger tier; removes ramp-up lag as a correctness concern; category/title freshness preserved via #20's cron | More moving parts than the uniform model (tier-aware subscription creation, initial full-follow-list fetch on login); still needs the `max_total_cost` measurement before committing | **Recommended direction**, pending real headroom measurement |
| Poll-based liveness refresh for the unmonitored subset instead of subscribing at all | No new EventSub subscription volume | Online/offline becomes poll-cadence-fresh, not push-real-time — contradicts the "100% atualizada" requirement for exactly this subset | Rejected as primary approach |

## Conclusion

Broadening monitoring scope to cover all followed channels (not just preference-covered ones)
is not "free" the way the `viewer_count` polling path turned out to be in TN 0001/0002 — it
runs into a real, if imprecisely-documented, Twitch-side `max_total_cost` ceiling that grows
with registered users, not with follow-list size, plus a Cloudflare-side subscription-creation
throughput cap already encoded in this codebase. Both are addressable by design rather than by
assuming headroom: a tiered subscription model (2 event types for followed-only broadcasters,
3 for preference-covered ones) reduces the Twitch-side cost on the larger tier without losing
functionality (category/title freshness is covered by #20's polling cron instead), and seeding
`channel_state` directly at login before EventSub subscriptions finish propagating removes the
Cloudflare-side throughput cap as a correctness concern, leaving it as a background-latency
detail only. The remaining open variable — actual `max_total_cost` headroom — is directly
measurable via `GET /helix/eventsub/subscriptions` and should be checked against real numbers
before an ADR is written, rather than estimated from Twitch's public docs alone.

No code or spec change resulted from this discussion. This feeds directly into
[issue #21](../../.agents/issues/21-followed-channels-without-preference-not-monitored.md),
which owns writing the eventual ADR.

## If we revisit this

Revisit once `max_total_cost`/`total_cost` is actually queried against the app's real client ID
— that number, plus real follow-list-size data from the current user base, is what turns the
"Recommended direction" above into an actual go/no-go for the tiered-subscription design. If
real numbers show the tiered design still risks exhausting `max_total_cost` at expected scale,
revisit the poll-based fallback (rejected here on freshness grounds, not cost grounds) or a
narrower monitoring expansion (e.g. only channels followed by more than one user, or only
channels the user has opened/viewed recently) as a middle ground.
