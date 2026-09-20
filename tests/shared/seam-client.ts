import type {
  InspectRequestBody,
  ResetRequestBody,
  SeedChannelStateInput,
  SeedEventsubSubscriptionInput,
  SeedFollowedChannelInput,
  SeedMonitoredChannelInput,
  SeedPreferencesInput,
  SeedPushSubscriptionInput,
  SeedRequestBody,
  SeedResponse,
  SeedUserInput,
} from "../../apps/api/src/http/routes/_tests"
import type { ChannelStateRecord } from "../../apps/api/src/db/repositories/channel-state"
import type { ChannelStateChangeRecord } from "../../apps/api/src/db/repositories/channel-state-changes"
import type { EventsubSubscriptionRecord } from "../../apps/api/src/db/repositories/eventsub-subscriptions"
import type { MonitoredChannelRecord } from "../../apps/api/src/db/repositories/monitored-channels"
import type { NotificationDeliveryRecord } from "../../apps/api/src/db/repositories/notification-deliveries"
import type { PushSubscriptionRecord } from "../../apps/api/src/types"

export {
  E2E_BROADCASTER_PREFIX,
  E2E_USER_ID,
} from "../../apps/api/src/http/routes/_tests"

export type {
  SeedChannelStateInput,
  SeedEventsubSubscriptionInput,
  SeedFollowedChannelInput,
  SeedMonitoredChannelInput,
  SeedPreferencesInput,
  SeedPushSubscriptionInput,
  SeedRequestBody,
  SeedUserInput,
}

export interface InspectResponse {
  monitoredChannels: MonitoredChannelRecord[]
  eventsubSubscriptions: EventsubSubscriptionRecord[]
  channelState: ChannelStateRecord[]
  channelStateChanges: ChannelStateChangeRecord[]
  notificationDeliveries: NotificationDeliveryRecord[]
  // Only populated when the inspect call passes a userId.
  pushSubscriptions: PushSubscriptionRecord[]
}

export interface SeededUser {
  userId: string
  sessionId: string
  cookie: string
}

export interface SeamClientOptions {
  // Lazy so the client can be built at module scope before the runner
  // provides the value (env vars injected by each tier's setup).
  baseUrl: () => string
}

/**
 * HTTP client for the test-seam endpoint (`/api/__test__/*`, see ADR 0025).
 * This is the only channel test setup/teardown goes through — the seam runs
 * inside the worker, so it reuses the same repository modules and D1/KV
 * bindings as the real routes without going through the public API. The
 * route only exists at all outside production (see `apps/api/src/index.ts`).
 */
export function createSeamClient({ baseUrl }: SeamClientOptions) {
  async function call(
    path: "/reset" | "/seed" | "/inspect",
    body: SeedRequestBody | ResetRequestBody | InspectRequestBody = {},
  ): Promise<unknown> {
    const res = await fetch(`${baseUrl()}/api/__test__${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(
        `Test-seam call to ${path} failed: ${res.status} ${await res.text()}`,
      )
    }
    if (res.status === 204) return undefined
    return res.json()
  }

  async function seed(body: SeedRequestBody): Promise<SeedResponse> {
    return (await call("/seed", body)) as SeedResponse
  }

  return {
    /** Deletes the E2E user's rows across all tables and its KV session keys. */
    async resetState(): Promise<void> {
      await call("/reset")
    },

    /**
     * Wipes every table and session. Only for runners with throwaway D1/KV
     * state (the api tier's isolated worker) — never against the dev DB.
     */
    async resetAll(): Promise<void> {
      await call("/reset", { scope: "all" })
    },

    /** Revokes a single session without touching D1 (simulates mid-session expiry). */
    async revokeSession(sessionId: string): Promise<void> {
      await call("/reset", { sessionId })
    },

    seed,

    async seedAuthenticatedUser(
      overrides?: SeedUserInput,
    ): Promise<SeededUser> {
      const result = await seed({ user: overrides ?? {} })
      if (!result.session) {
        throw new Error("Test seam did not return a session for seeded user")
      }
      return {
        userId: result.userId,
        sessionId: result.session.sessionId,
        cookie: result.session.cookie,
      }
    },

    async seedFollowedChannels(
      channels: SeedFollowedChannelInput[],
    ): Promise<void> {
      await seed({ followedChannels: channels })
    },

    async seedChannelState(states: SeedChannelStateInput[]): Promise<void> {
      await seed({ channelState: states })
    },

    async seedPreferences(preferences: SeedPreferencesInput): Promise<void> {
      await seed({ preferences })
    },

    async seedEventsubSubscriptions(
      subscriptions: SeedEventsubSubscriptionInput[],
    ): Promise<void> {
      await seed({ eventsubSubscriptions: subscriptions })
    },

    /** Reads broadcaster-keyed monitoring state the public API never exposes. */
    async inspect(
      broadcasterUserIds: string[],
      userId?: string,
    ): Promise<InspectResponse> {
      return (await call("/inspect", {
        broadcasterUserIds,
        ...(userId ? { userId } : {}),
      })) as InspectResponse
    },
  }
}

export type SeamClient = ReturnType<typeof createSeamClient>
