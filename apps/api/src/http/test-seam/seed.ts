import { nanoid } from "nanoid"
import type { Context } from "hono"
import type { HonoEnv } from "../../env"
import { createDatabaseClient } from "../../db/client"
import { eventsubSubscriptions } from "../../db/schema"
import { base64UrlEncode } from "../../lib/base64url"
import { encryptToken } from "../../lib/crypto"
import { createSession, sessionCookieHeader } from "../../features/auth/session"
import { jsonResponse } from "../response"
import { E2E_USER_ID, readJsonBody } from "./shared"

export interface SeedUserInput {
  id?: string
  twitchUserId?: string
  twitchLogin?: string
  twitchDisplayName?: string
  // When set, real (encrypted) rows land in twitch_tokens so token-refresh
  // paths can be exercised; expiredToken backdates expires_at.
  accessToken?: string
  refreshToken?: string
  expiredToken?: boolean
  // Backdates the token's last validation so the validate sweep picks it up.
  tokenValidatedAt?: string
  // Stores tokens that fail to decrypt, as after a key rotation or corruption.
  undecryptableToken?: boolean
  // Seeds a refresh claim held until this time, as by a refresh in flight (or a worker that died mid-refresh when it's in the past).
  refreshLockedUntil?: string
  // Seeds a session closer to expiry (or its max lifetime) than a fresh login.
  sessionTtlS?: number
  sessionMaxLifetimeS?: number
  // Applied whenever present, null included, so a re-seed resets a value a
  // previous test left on the shared user row; omitted leaves it untouched.
  lastFollowSyncAt?: string | null
  notificationsPausedAt?: string | null
}

export interface SeedFollowedChannelInput {
  broadcasterUserId: string
  broadcasterLogin: string
  broadcasterDisplayName: string
  broadcasterProfileImageUrl?: string | null
  followedAt?: string | null
}

export interface SeedChannelStateInput {
  broadcasterUserId: string
  isLive: boolean
  streamId?: string | null
  categoryId?: string | null
  categoryName?: string | null
  title?: string | null
  thumbnailUrl?: string | null
  viewerCount?: number | null
  startedAt?: string | null
  streamType?: string | null
  lastLiveAt?: string | null
  lastCategoryId?: string | null
  lastCategoryName?: string | null
}

export interface SeedPreferencesInput {
  channel?: {
    broadcasterUserId: string
    categoryId: string
    categoryName: string
  }[]
  global?: {
    categoryId: string
    categoryName: string
    // Broadcasters excluded from this global preference (ADR 0054).
    excludedBroadcasterUserIds?: string[]
  }[]
}

export interface SeedEventsubSubscriptionInput {
  broadcasterUserId: string
  eventType: string
  eventVersion?: string
  status?: string
  twitchSubscriptionId?: string | null
  callbackUrl?: string
  failureCount?: number
  // ISO timestamp, or omit for null (immediately eligible).
  nextRetryAt?: string | null
  updatedAt?: string
}

export interface SeedMonitoredChannelInput {
  broadcasterUserId: string
  broadcasterLogin?: string
  broadcasterDisplayName?: string
  disabled?: boolean
}

export interface SeedPushSubscriptionInput {
  endpoint: string
  // Omitted keys are generated as a real P-256 point and 16-byte secret so
  // the Web Push encryption path works against them (ADR 0035).
  p256dh?: string
  auth?: string
  revoked?: boolean
}

export interface SeedNotificationSnoozeInput {
  userId?: string
  broadcasterUserId: string
  categoryId: string
  fireAt: string
  // Defaults to "pending" — tests exercising the sweep set this via fireAt
  // in the past rather than the status directly; "fired"/"expired" let a
  // test seed a snooze already past its lifecycle without running the sweep.
  status?: "pending" | "fired" | "expired"
}

export interface SeedBroadcasterMuteInput {
  broadcasterUserId: string
}

export interface SeedRequestBody {
  user?: SeedUserInput
  followedChannels?: SeedFollowedChannelInput[]
  channelState?: SeedChannelStateInput[]
  preferences?: SeedPreferencesInput
  eventsubSubscriptions?: SeedEventsubSubscriptionInput[]
  monitoredChannels?: SeedMonitoredChannelInput[]
  pushSubscriptions?: SeedPushSubscriptionInput[]
  notificationSnoozes?: SeedNotificationSnoozeInput[]
  broadcasterMutes?: SeedBroadcasterMuteInput[]
}

export interface SeedResponse {
  userId: string
  session?: { sessionId: string; cookie: string }
}

export async function handleTestSeed(c: Context<HonoEnv>): Promise<Response> {
  const body = await readJsonBody<SeedRequestBody>(c)
  const now = new Date().toISOString()
  const userId = body.user?.id ?? E2E_USER_ID

  let session: { sessionId: string; cookie: string } | undefined

  if (body.user) {
    await c.var.db.users.upsert({
      id: userId,
      twitchUserId: body.user.twitchUserId ?? "e2e_twitch_user",
      twitchLogin: body.user.twitchLogin ?? "e2e_login",
      twitchDisplayName: body.user.twitchDisplayName ?? "E2E Test User",
      now,
    })

    if (body.user.lastFollowSyncAt !== undefined) {
      await c.var.db.users.updateLastFollowSyncAt(
        userId,
        body.user.lastFollowSyncAt,
        now,
      )
    }

    if (body.user.notificationsPausedAt !== undefined) {
      await c.var.db.users.setNotificationsPausedAt(
        userId,
        body.user.notificationsPausedAt,
        now,
      )
    }

    if (body.user.accessToken) {
      const expiresAt = body.user.expiredToken
        ? new Date(Date.now() - 1000).toISOString()
        : new Date(Date.now() + 60 * 60 * 1000).toISOString()

      const encrypt = (token: string) =>
        body?.user?.undecryptableToken
          ? Promise.resolve(`not-encrypted:${token}`)
          : encryptToken(token, c.var.config.tokenEncryptionKey)
      await c.var.db.twitchTokens.upsert({
        userId,
        accessToken: await encrypt(body.user.accessToken),
        refreshToken: await encrypt(
          body.user.refreshToken ?? "refresh-placeholder",
        ),
        expiresAt,
        scopes: "user:read:follows",
        now,
      })
      if (body.user.refreshLockedUntil) {
        await c.var.db.twitchTokens.claimRefreshLock(
          userId,
          now,
          body.user.refreshLockedUntil,
        )
      }
      if (body.user.tokenValidatedAt) {
        await c.var.db.twitchTokens.markValidated(
          userId,
          body.user.tokenValidatedAt,
        )
      }
    }

    const sessionId = await createSession(c.env.KV_APP_CACHE, userId, {
      ttlS: body.user.sessionTtlS,
      maxLifetimeS: body.user.sessionMaxLifetimeS,
    })
    session = { sessionId, cookie: sessionCookieHeader(sessionId) }
  }

  if (body.followedChannels?.length) {
    await c.var.db.followedChannels.upsertAll(
      body.followedChannels.map((channel) => ({
        userId,
        broadcasterUserId: channel.broadcasterUserId,
        broadcasterLogin: channel.broadcasterLogin,
        broadcasterDisplayName: channel.broadcasterDisplayName,
        broadcasterProfileImageUrl: channel.broadcasterProfileImageUrl ?? null,
        followedAt: channel.followedAt ?? null,
        now,
      })),
    )
  }

  if (body.channelState?.length) {
    await c.var.db.channelState.upsertAll(
      body.channelState.map((state) => ({
        broadcasterUserId: state.broadcasterUserId,
        isLive: state.isLive,
        streamId: state.streamId ?? null,
        categoryId: state.categoryId ?? null,
        categoryName: state.categoryName ?? null,
        title: state.title ?? null,
        thumbnailUrl: state.thumbnailUrl ?? null,
        viewerCount: state.viewerCount ?? null,
        startedAt: state.startedAt ?? null,
        streamType: state.streamType ?? null,
        lastLiveAt: state.lastLiveAt ?? null,
        lastCategoryId: state.lastCategoryId ?? null,
        lastCategoryName: state.lastCategoryName ?? null,
        now,
      })),
    )
  }

  if (body.preferences) {
    for (const pref of body.preferences.channel ?? []) {
      await c.var.db.channelCategoryPreferences.create({
        userId,
        broadcasterUserId: pref.broadcasterUserId,
        categoryId: pref.categoryId,
        categoryName: pref.categoryName,
        now,
      })
    }
    for (const pref of body.preferences.global ?? []) {
      const preferenceId = await c.var.db.globalCategoryPreferences.create({
        userId,
        categoryId: pref.categoryId,
        categoryName: pref.categoryName,
        now,
      })
      for (const broadcasterUserId of pref.excludedBroadcasterUserIds ?? []) {
        await c.var.db.globalCategoryPreferenceExclusions.create({
          preferenceId,
          broadcasterUserId,
          now,
        })
      }
    }
  }

  if (body.eventsubSubscriptions?.length) {
    const db = createDatabaseClient(c.env.DB)
    for (const sub of body.eventsubSubscriptions) {
      await db
        .insert(eventsubSubscriptions)
        .values({
          id: `esub_${nanoid()}`,
          twitchSubscriptionId: sub.twitchSubscriptionId ?? null,
          broadcasterUserId: sub.broadcasterUserId,
          eventType: sub.eventType,
          eventVersion: sub.eventVersion ?? "1",
          status: sub.status ?? "pending",
          callbackUrl:
            sub.callbackUrl ??
            `${c.var.config.publicUrl}/api/webhooks/twitch/eventsub`,
          secretVersion: "1",
          failureCount: sub.failureCount ?? 0,
          nextRetryAt: sub.nextRetryAt ?? null,
          createdAt: now,
          updatedAt: sub.updatedAt ?? now,
        })
        .run()
    }
  }

  if (body.monitoredChannels?.length) {
    await c.var.db.monitoredChannels.upsertAll(
      body.monitoredChannels.map((channel) => ({
        broadcasterUserId: channel.broadcasterUserId,
        broadcasterLogin: channel.broadcasterLogin ?? null,
        broadcasterDisplayName: channel.broadcasterDisplayName ?? null,
        monitorReason: "channel_preference",
        now,
      })),
    )
    for (const channel of body.monitoredChannels) {
      if (channel.disabled) {
        await c.var.db.monitoredChannels.disable(channel.broadcasterUserId, now)
      }
    }
  }

  if (body.pushSubscriptions?.length) {
    for (const subscription of body.pushSubscriptions) {
      const record = await c.var.db.pushSubscriptions.create({
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh ?? (await generateP256dhKey()),
        auth: subscription.auth ?? generateAuthSecret(),
        userAgent: null,
        now,
      })
      if (subscription.revoked) {
        await c.var.db.pushSubscriptions.revoke(record.id, now)
      }
    }
  }

  if (body.notificationSnoozes?.length) {
    for (const snooze of body.notificationSnoozes) {
      const record = await c.var.db.notificationSnoozes.create({
        userId: snooze.userId ?? userId,
        broadcasterUserId: snooze.broadcasterUserId,
        categoryId: snooze.categoryId,
        fireAt: snooze.fireAt,
        now,
      })
      if (snooze.status === "fired") {
        await c.var.db.notificationSnoozes.markFired(record.id)
      } else if (snooze.status === "expired") {
        await c.var.db.notificationSnoozes.markExpired(record.id)
      }
    }
  }

  for (const mute of body.broadcasterMutes ?? []) {
    await c.var.db.broadcasterMutes.create({
      userId,
      broadcasterUserId: mute.broadcasterUserId,
      now,
    })
  }

  return jsonResponse({ userId, session } satisfies SeedResponse)
}

/**
 * A real (throwaway) P-256 public key — Web Push payload encryption performs
 * actual ECDH against it, so a placeholder string would fail the send path.
 */
async function generateP256dhKey(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey)
  return base64UrlEncode(new Uint8Array(raw))
}

function generateAuthSecret(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)))
}
