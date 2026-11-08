import type { ZodType } from "zod"
import { CategorySearchResponse } from "./categories"
import { FollowedChannelsResponse } from "./channels"
import { HealthResponse, RootResponse } from "./health"
import { MeResponse } from "./me"
import {
  BroadcasterMuteResponse,
  BroadcasterMutesResponse,
  NotificationSnoozeResponse,
  NotificationSnoozesResponse,
} from "./notifications"
import {
  ChannelPreferenceResponse,
  GlobalPreferenceExclusionResponse,
  GlobalPreferenceResponse,
  PreferencesResponse,
} from "./preferences"
import { PushSubscriptionResponse, VapidPublicKeyResponse } from "./push"

/**
 * Success-status -> JSON body contract per route, keyed `METHOD /full/path`
 * (ADR 0067). `{}` means the route never answers with a JSON body (`204`,
 * redirect, plain text). Error bodies are `ErrorEnvelope` everywhere, so they
 * are not repeated per route. `/__test__/*` and `/__sandbox__/*` are exempt.
 * `tests/api/contract-coverage.test.ts` fails when its keys and `buildApp()`'s routes disagree; statuses and schemas are documentation for readers, enforced by `satisfies` and `expectConforms`.
 */
export const ROUTE_CONTRACTS: Record<string, Record<number, ZodType>> = {
  "GET /": { 200: RootResponse },
  "GET /health": { 200: HealthResponse },
  "GET /api/health": { 200: HealthResponse },
  "GET /api/auth/twitch/start": {},
  "GET /api/auth/twitch/callback": {},
  "POST /api/auth/logout": {},
  "GET /api/me": { 200: MeResponse },
  "PATCH /api/me/language": { 200: MeResponse },
  "PATCH /api/me/notifications-paused": { 200: MeResponse },
  "POST /api/sync/follows": { 200: FollowedChannelsResponse },
  "GET /api/channels/followed": { 200: FollowedChannelsResponse },
  "GET /api/categories/search": { 200: CategorySearchResponse },
  "GET /api/preferences": { 200: PreferencesResponse },
  "POST /api/preferences/channel": {
    200: ChannelPreferenceResponse,
    201: ChannelPreferenceResponse,
  },
  "DELETE /api/preferences/channel/:id": {},
  "POST /api/preferences/global": {
    200: GlobalPreferenceResponse,
    201: GlobalPreferenceResponse,
  },
  "DELETE /api/preferences/global/:id": {},
  "POST /api/preferences/global/:id/exclusions": {
    200: GlobalPreferenceExclusionResponse,
    201: GlobalPreferenceExclusionResponse,
  },
  "DELETE /api/preferences/global/:id/exclusions/:exclusionId": {},
  "POST /api/notifications/snooze": {
    200: NotificationSnoozeResponse,
    201: NotificationSnoozeResponse,
  },
  "GET /api/notifications/snoozes": { 200: NotificationSnoozesResponse },
  "GET /api/notifications/mutes": { 200: BroadcasterMutesResponse },
  "POST /api/notifications/mutes": {
    200: BroadcasterMuteResponse,
    201: BroadcasterMuteResponse,
  },
  "DELETE /api/notifications/mutes/:id": {},
  "POST /api/webhooks/twitch/eventsub": {},
  "GET /api/push/vapid-public-key": { 200: VapidPublicKeyResponse },
  "POST /api/push-subscriptions": {
    200: PushSubscriptionResponse,
    201: PushSubscriptionResponse,
  },
  "DELETE /api/push-subscriptions/:id": {},
}
