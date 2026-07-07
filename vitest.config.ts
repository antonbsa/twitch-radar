import { defineConfig } from "vitest/config"
import { loadDevVars } from "./dev-env"

// API tier: real HTTP requests against a worker + mock Twitch server that
// tests/api/setup/global-setup.ts boots before any test file runs and tears
// down after — see tests/api/setup/ports.ts for the fixed ports both sides
// agree on. Mirrors the e2e tier's globalSetup pattern (vitest.e2e.config.ts).
export default defineConfig({
  test: {
    include: ["tests/api/**/*.test.ts"],
    globalSetup: ["tests/api/setup/global-setup.ts"],
    fileParallelism: false,
    env: loadDevVars(),
  },
})
