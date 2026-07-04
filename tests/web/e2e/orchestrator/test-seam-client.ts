import { createSeamClient } from "../../../shared/seam-client"

export {
  E2E_BROADCASTER_PREFIX,
  E2E_USER_ID,
  type SeedChannelStateInput,
  type SeedFollowedChannelInput,
  type SeedPreferencesInput,
  type SeedUserInput,
  type SeededUser,
} from "../../../shared/seam-client"

function requireEnv(name: "API_URL" | "TEST_SEED_TOKEN"): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set — the e2e global setup (tests/web/e2e/setup/global-setup.ts) should have injected it`,
    )
  }
  return value
}

// The env vars are read lazily on each call, so the client can be built at
// module scope before the global setup has injected them.
// Note: `resetAll` is deliberately not re-exported — this tier runs against
// the dev DB, where only the scoped `resetState` is safe.
const client = createSeamClient({
  baseUrl: () => requireEnv("API_URL"),
  token: () => requireEnv("TEST_SEED_TOKEN"),
})

export const {
  resetState,
  revokeSession,
  seedAuthenticatedUser,
  seedFollowedChannels,
  seedChannelState,
  seedPreferences,
} = client
