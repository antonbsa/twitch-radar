import { eq, inArray } from "drizzle-orm"
import { z } from "zod"
import type { Context } from "hono"
import { createDatabaseClient } from "../../db/client"
import {
  broadcasterMutes,
  channelCategoryPreferences,
  followedChannels,
  globalCategoryPreferenceExclusions,
  globalCategoryPreferences,
  notificationSnoozes,
} from "../../db/schema"
import type { HonoEnv } from "../../env"
import { SUPPORTED_LANGUAGES } from "../../db/repositories/users"
import { ApiError } from "../../http/errors"
import { encryptToken } from "../../lib/crypto"
import { parseBody } from "../../http/handlers"
import { jsonResponse } from "../../http/response"
import { createSession, sessionCookieHeader } from "../auth/session"
import {
  accessTokenFor,
  CATEGORIES,
  getPersonaFixture,
  PERSONAS,
  refreshTokenFor,
  type Persona,
  type PersonaFixture,
} from "./personas"

// Each key present replaces the fixture's value wholesale (no deep merge), and
// only rows of the chosen persona are touched, so the closed persona enum
// stays the safety property (ADR 0046).
const OverridesSchema = z.strictObject({
  tokenState: z.enum(["valid", "reconnect_required"]).optional(),
  notificationsPaused: z.boolean().optional(),
  language: z.enum(SUPPORTED_LANGUAGES).optional(),
  mutedBroadcasterUserIds: z.array(z.string()).optional(),
  preferences: z
    .strictObject({
      channel: z
        .array(
          z.strictObject({
            broadcasterUserId: z.string(),
            categoryId: z.string(),
          }),
        )
        .default([]),
      global: z
        .array(
          z.strictObject({
            categoryId: z.string(),
            excludedBroadcasterUserIds: z.array(z.string()).default([]),
          }),
        )
        .default([]),
    })
    .optional(),
})
type Overrides = z.infer<typeof OverridesSchema>

const LoginSchema = z.object({
  persona: z.enum(PERSONAS),
  overrides: OverridesSchema.optional(),
})

/**
 * The persona's fixture with `overrides` applied. Channels must be seeded
 * follows of the persona (the rows login writes) and categories must be in
 * the fixture catalog, which also supplies their display names.
 */
function applyOverrides(
  fixture: PersonaFixture,
  overrides: Overrides = {},
): PersonaFixture {
  const seededIds = new Set(
    fixture.follows.filter((f) => f.seeded).map((f) => f.broadcasterUserId),
  )
  const invalid = (message: string) =>
    new ApiError(400, "invalid_request", message)
  const categoryName = (categoryId: string) => {
    const category = CATEGORIES.find((c) => c.id === categoryId)
    if (!category) throw invalid(`Unknown sandbox category: ${categoryId}`)
    return category.name
  }
  const requireSeeded = (broadcasterUserId: string) => {
    if (!seededIds.has(broadcasterUserId))
      throw invalid(`Not a seeded follow of this persona: ${broadcasterUserId}`)
    return broadcasterUserId
  }

  const { preferences, mutedBroadcasterUserIds, ...settings } = overrides
  mutedBroadcasterUserIds?.forEach(requireSeeded)
  return {
    ...fixture,
    ...settings,
    ...(mutedBroadcasterUserIds && { mutedBroadcasterUserIds }),
    ...(preferences && {
      preferences: {
        channel: preferences.channel.map((pref) => ({
          broadcasterUserId: requireSeeded(pref.broadcasterUserId),
          categoryId: pref.categoryId,
          categoryName: categoryName(pref.categoryId),
        })),
        global: preferences.global.map((pref) => ({
          categoryId: pref.categoryId,
          categoryName: categoryName(pref.categoryId),
          excludedBroadcasterUserIds:
            pref.excludedBroadcasterUserIds.map(requireSeeded),
        })),
      },
    }),
  }
}

const TOKEN_TTL_MS = 4 * 60 * 60 * 1000

/**
 * Drops the user-owned rows login re-creates, so a repeat login restores the
 * fixture baseline instead of stacking on what a previous session changed.
 * Push subscriptions survive, so a device keeps receiving pushes across logins.
 */
async function resetPersonaState(c: Context<HonoEnv>, userId: string) {
  const db = createDatabaseClient(c.env.DB)
  await db
    .delete(globalCategoryPreferenceExclusions)
    .where(
      inArray(
        globalCategoryPreferenceExclusions.preferenceId,
        db
          .select({ id: globalCategoryPreferences.id })
          .from(globalCategoryPreferences)
          .where(eq(globalCategoryPreferences.userId, userId)),
      ),
    )
    .run()
  await db
    .delete(globalCategoryPreferences)
    .where(eq(globalCategoryPreferences.userId, userId))
    .run()
  await db
    .delete(channelCategoryPreferences)
    .where(eq(channelCategoryPreferences.userId, userId))
    .run()
  await db
    .delete(notificationSnoozes)
    .where(eq(notificationSnoozes.userId, userId))
    .run()
  await db
    .delete(broadcasterMutes)
    .where(eq(broadcasterMutes.userId, userId))
    .run()
  await db
    .delete(followedChannels)
    .where(eq(followedChannels.userId, userId))
    .run()
}

/**
 * Upserts the persona's user, Twitch token, seeded follows, channel state and
 * preferences.
 */
async function seedPersona(
  c: Context<HonoEnv>,
  persona: Persona,
  overrides?: Overrides,
) {
  const { db, config } = c.var
  const fixture = applyOverrides(getPersonaFixture(persona), overrides)
  const userId = fixture.user.id
  const now = new Date().toISOString()

  await resetPersonaState(c, userId)
  await db.users.upsert({
    id: userId,
    twitchUserId: fixture.user.twitchUserId,
    twitchLogin: fixture.user.login,
    twitchDisplayName: fixture.user.displayName,
    now,
  })

  await db.twitchTokens.upsert({
    userId,
    accessToken: await encryptToken(
      accessTokenFor(persona),
      config.tokenEncryptionKey,
    ),
    refreshToken: await encryptToken(
      refreshTokenFor(persona),
      config.tokenEncryptionKey,
    ),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
    scopes: "user:read:follows",
    now,
  })
  if (fixture.tokenState === "reconnect_required") {
    await db.twitchTokens.markRefreshFailed(userId, now)
  }

  await db.users.updateLanguage(userId, fixture.language ?? "en", now)
  await db.users.setNotificationsPausedAt(
    userId,
    fixture.notificationsPaused ? now : null,
    now,
  )
  for (const broadcasterUserId of fixture.mutedBroadcasterUserIds ?? []) {
    await db.broadcasterMutes.create({ userId, broadcasterUserId, now })
  }

  // Stamped fresh so the app's auto-sync on load doesn't consume the fixture's
  // unsynced follows; `Sync follows` is the user's to trigger (ADR 0046).
  await db.users.updateLastFollowSyncAt(userId, now, now)

  const seeded = fixture.follows.filter((follow) => follow.seeded)
  await db.followedChannels.upsertAll(
    seeded.map((follow) => ({
      userId,
      broadcasterUserId: follow.broadcasterUserId,
      broadcasterLogin: follow.login,
      broadcasterDisplayName: follow.displayName,
      followedAt: follow.followedAt,
      now,
    })),
  )
  await db.channelState.upsertAll(
    seeded.map(({ broadcasterUserId, stream }) => {
      const startedAt = stream
        ? new Date(Date.now() - stream.startedMinutesAgo * 60_000).toISOString()
        : null
      return {
        broadcasterUserId,
        isLive: stream !== null,
        streamId: stream?.id ?? null,
        categoryId: stream?.categoryId ?? null,
        categoryName: stream?.categoryName ?? null,
        title: stream?.title ?? null,
        viewerCount: stream?.viewerCount ?? null,
        startedAt,
        categoryStartedAt: startedAt,
        now,
      }
    }),
  )

  for (const pref of fixture.preferences.channel) {
    await db.channelCategoryPreferences.create({ userId, ...pref, now })
  }
  for (const pref of fixture.preferences.global) {
    const preferenceId = await db.globalCategoryPreferences.create({
      userId,
      categoryId: pref.categoryId,
      categoryName: pref.categoryName,
      now,
    })
    for (const broadcasterUserId of pref.excludedBroadcasterUserIds) {
      await db.globalCategoryPreferenceExclusions.create({
        preferenceId,
        broadcasterUserId,
        now,
      })
    }
  }

  return userId
}

/**
 * `POST /api/__sandbox__/login`: signs in as one of the fixed personas with a
 * real KV session. The closed enum is the whole safety property (ADR 0046).
 */
export async function handleSandboxLogin(
  c: Context<HonoEnv>,
): Promise<Response> {
  const { persona, overrides } = await parseBody(
    c,
    LoginSchema,
    "Invalid persona",
  )
  const userId = await seedPersona(c, persona, overrides)
  const sessionId = await createSession(c.env.KV_APP_CACHE, userId)

  return jsonResponse(
    { data: { persona, user_id: userId } },
    { headers: { "Set-Cookie": sessionCookieHeader(sessionId) } },
  )
}
