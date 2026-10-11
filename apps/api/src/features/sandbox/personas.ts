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
