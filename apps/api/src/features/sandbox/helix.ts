import { Hono, type Context } from "hono"
import { nanoid } from "nanoid"
import type { HonoEnv } from "../../env"
import {
  boxArtUrl,
  CATEGORIES,
  getPersonaFixture,
  PERSONAS,
  personaFromAccessToken,
  personaFromRefreshToken,
  accessTokenFor,
  refreshTokenFor,
  type FixtureFollow,
  type Persona,
  type PersonaFixture,
} from "./personas"

/**
 * In-worker stand-in for the parts of Twitch Helix and id.twitch.tv the app
 * calls (ADR 0046), answering from the persona fixtures: each fixture is that
 * persona's full Twitch-side state, which is why `Sync follows` finds follows
 * D1 doesn't have yet. Response shapes follow `services/twitch/*`. Mount
 * `helix` at `/helix` and `auth` at `/auth` under `/api/__sandbox__`, and point
 * `TWITCH_API_BASE_URL` / `TWITCH_AUTH_BASE_URL` at them.
 */

const fixtures = (): PersonaFixture[] => PERSONAS.map(getPersonaFixture)

const personaByTwitchUserId = (twitchUserId: string | undefined) =>
  fixtures().find((fixture) => fixture.user.twitchUserId === twitchUserId)

const bearerToken = (c: Context<HonoEnv>): string | undefined =>
  c.req.header("Authorization")?.replace(/^(Bearer|OAuth) /, "")

const toStream = (follow: FixtureFollow) => {
  const stream = follow.stream!
  return {
    id: stream.id,
    user_id: follow.broadcasterUserId,
    user_login: follow.login,
    user_name: follow.displayName,
    game_id: stream.categoryId,
    game_name: stream.categoryName,
    type: "live",
    title: stream.title,
    viewer_count: stream.viewerCount,
    started_at: new Date(
      Date.now() - stream.startedMinutesAgo * 60_000,
    ).toISOString(),
    // Empty so the app falls back to its no-thumbnail state.
    thumbnail_url: "",
  }
}

const toUser = (id: string, login: string, displayName: string) => ({
  id,
  login,
  display_name: displayName,
  profile_image_url: "",
})

// Built by functions, not at module scope: a top-level `helix.get(...)` is a
// side effect, which would keep this module (and the fixtures) in the
// production bundle even though app.ts only calls it under the build flag.
export function buildHelixRouter(): Hono<HonoEnv> {
  const helix = new Hono<HonoEnv>()

  helix.get("/users", (c) => {
    const ids = c.req.queries("id")
    if (!ids) {
      const persona = personaFromAccessToken(bearerToken(c))
      if (!persona)
        return c.json({ status: 401, message: "Invalid token" }, 401)
      const { user } = getPersonaFixture(persona)
      return c.json({
        data: [toUser(user.twitchUserId, user.login, user.displayName)],
      })
    }

    const known = new Map<string, ReturnType<typeof toUser>>()
    for (const { user, follows } of fixtures()) {
      known.set(
        user.twitchUserId,
        toUser(user.twitchUserId, user.login, user.displayName),
      )
      for (const f of follows) {
        known.set(
          f.broadcasterUserId,
          toUser(f.broadcasterUserId, f.login, f.displayName),
        )
      }
    }
    return c.json({ data: ids.flatMap((id) => known.get(id) ?? []) })
  })

  helix.get("/channels/followed", (c) => {
    const fixture = personaByTwitchUserId(c.req.query("user_id"))
    const follows = fixture?.follows ?? []
    return c.json({
      total: follows.length,
      data: follows.map((f) => ({
        broadcaster_id: f.broadcasterUserId,
        broadcaster_login: f.login,
        broadcaster_name: f.displayName,
        followed_at: f.followedAt,
      })),
      pagination: {},
    })
  })

  helix.get("/streams/followed", (c) => {
    const fixture = personaByTwitchUserId(c.req.query("user_id"))
    const live = (fixture?.follows ?? []).filter((f) => f.stream)
    return c.json({ data: live.map(toStream), pagination: {} })
  })

  helix.get("/streams", (c) => {
    const wanted = new Set(c.req.queries("user_id") ?? [])
    const live = new Map<string, FixtureFollow>()
    for (const { follows } of fixtures()) {
      for (const f of follows) {
        if (f.stream && wanted.has(f.broadcasterUserId)) {
          live.set(f.broadcasterUserId, f)
        }
      }
    }
    return c.json({ data: [...live.values()].map(toStream), pagination: {} })
  })

  const toCategory = (category: { id: string; name: string }) => ({
    ...category,
    box_art_url: boxArtUrl(category.id),
  })

  helix.get("/search/categories", (c) => {
    const query = (c.req.query("query") ?? "").toLowerCase()
    const matches = CATEGORIES.filter((category) =>
      category.name.toLowerCase().includes(query),
    )
    return c.json({ data: matches.map(toCategory) })
  })

  helix.get("/games", (c) => {
    const ids = new Set(c.req.queries("id") ?? [])
    return c.json({
      data: CATEGORIES.filter((category) => ids.has(category.id)).map(
        toCategory,
      ),
    })
  })

  // EventSub management is accepted and forgotten: delivery is driven by
  // `POST /api/__sandbox__/events`, not by Twitch calling back.
  helix.post("/eventsub/subscriptions", async (c) => {
    const body = await c.req
      .json<{ type?: string; version?: string }>()
      .catch(() => ({}) as { type?: string; version?: string })
    return c.json(
      {
        data: [
          {
            id: `sbx_sub_${nanoid()}`,
            status: "enabled",
            type: body.type ?? "",
            version: body.version ?? "1",
          },
        ],
      },
      202,
    )
  })
  helix.get("/eventsub/subscriptions", (c) =>
    c.json({ data: [], pagination: {} }),
  )
  helix.delete(
    "/eventsub/subscriptions",
    () => new Response(null, { status: 204 }),
  )

  return helix
}

const TOKEN_TTL_S = 4 * 60 * 60
const APP_TOKEN_TTL_S = 60 * 24 * 60 * 60

export function buildAuthRouter(): Hono<HonoEnv> {
  const auth = new Hono<HonoEnv>()

  auth.post("/oauth2/token", async (c) => {
    const form = await c.req.formData().catch(() => null)
    const grantType = form?.get("grant_type")

    if (grantType === "client_credentials") {
      return c.json({
        access_token: "sandbox-app-token",
        expires_in: APP_TOKEN_TTL_S,
        token_type: "bearer",
      })
    }

    const persona: Persona | null =
      grantType === "refresh_token"
        ? personaFromRefreshToken(form?.get("refresh_token")?.toString())
        : null
    if (!persona) {
      return c.json({ status: 400, message: "Invalid grant" }, 400)
    }
    return c.json({
      access_token: accessTokenFor(persona),
      refresh_token: refreshTokenFor(persona),
      expires_in: TOKEN_TTL_S,
      scope: ["user:read:follows"],
      token_type: "bearer",
    })
  })

  auth.get("/oauth2/validate", (c) =>
    personaFromAccessToken(bearerToken(c))
      ? c.json({ expires_in: TOKEN_TTL_S })
      : c.json({ status: 401, message: "invalid access token" }, 401),
  )

  return auth
}
