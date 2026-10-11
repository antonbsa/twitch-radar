import categories from "../../../../../infra/fixtures/sandbox/categories.json"
import empty from "../../../../../infra/fixtures/sandbox/empty.json"
import full from "../../../../../infra/fixtures/sandbox/full.json"
import reconnect from "../../../../../infra/fixtures/sandbox/reconnect.json"

export const PERSONAS = ["full", "empty", "reconnect"] as const
export type Persona = (typeof PERSONAS)[number]

export interface FixtureStream {
  id: string
  categoryId: string
  categoryName: string
  title: string
  viewerCount: number
  startedMinutesAgo: number
}

export interface FixtureFollow {
  broadcasterUserId: string
  login: string
  displayName: string
  followedAt: string
  // Whether login pre-loads this follow into D1. The fixture as a whole is the
  // persona's Twitch-side truth, so unseeded follows are what `Sync follows`
  // discovers (ADR 0046).
  seeded: boolean
  stream: FixtureStream | null
}

export interface PersonaFixture {
  user: {
    id: string
    twitchUserId: string
    login: string
    displayName: string
  }
  tokenState: "valid" | "reconnect_required"
  follows: FixtureFollow[]
  preferences: {
    channel: {
      broadcasterUserId: string
      categoryId: string
      categoryName: string
    }[]
    global: {
      categoryId: string
      categoryName: string
      excludedBroadcasterUserIds: string[]
    }[]
  }
}

const FIXTURES: Record<Persona, PersonaFixture> = {
  full: full as PersonaFixture,
  empty: empty as PersonaFixture,
  reconnect: reconnect as PersonaFixture,
}

export const getPersonaFixture = (persona: Persona): PersonaFixture =>
  FIXTURES[persona]

export interface FixtureCategory {
  id: string
  name: string
}

export const CATEGORIES: FixtureCategory[] = categories

/** Real Twitch box art CDN template, so sandbox categories render art. */
export const boxArtUrl = (categoryId: string): string =>
  `https://static-cdn.jtvnw.net/ttv-boxart/${categoryId}-{width}x{height}.jpg`

// The persona rides in the token so the fake Helix can tell callers apart
// (every persona shares the same app and bearer-token transport).
const ACCESS_TOKEN_PREFIX = "sandbox-access-"
const REFRESH_TOKEN_PREFIX = "sandbox-refresh-"

export const accessTokenFor = (persona: Persona): string =>
  `${ACCESS_TOKEN_PREFIX}${persona}`
export const refreshTokenFor = (persona: Persona): string =>
  `${REFRESH_TOKEN_PREFIX}${persona}`

const personaFromPrefixedToken = (
  token: string | undefined,
  prefix: string,
): Persona | null => {
  const suffix = token?.startsWith(prefix) ? token.slice(prefix.length) : null
  return PERSONAS.find((persona) => persona === suffix) ?? null
}

export const personaFromAccessToken = (token: string | undefined) =>
  personaFromPrefixedToken(token, ACCESS_TOKEN_PREFIX)
export const personaFromRefreshToken = (token: string | undefined) =>
  personaFromPrefixedToken(token, REFRESH_TOKEN_PREFIX)
