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

function requireApiUrl(): string {
  const value = process.env.PUBLIC_URL
  if (!value) {
    throw new Error(
      "PUBLIC_URL is not set — the e2e global setup (tests/web/e2e/setup/global-setup.ts) should have injected it",
    )
  }
  return value
}

// Read lazily so the client can be built at module scope before the global
// setup has injected the env var.
// Note: `resetAll` is deliberately not re-exported — this tier runs against
// the dev DB, where only the scoped `resetState` is safe.
const client = createSeamClient({ baseUrl: requireApiUrl })

export const {
  resetState,
  revokeSession,
  seedAuthenticatedUser,
  seedFollowedChannels,
  seedChannelState,
  seedPreferences,
} = client
