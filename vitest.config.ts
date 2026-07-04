import { defineConfig } from "vitest/config"
import { loadDevVars } from "./dev-env"

// API tier: real HTTP requests against a worker + mock Twitch server booted
// by the "test:api:*" npm scripts (root package.json) before this runs —
// see tests/api/setup/ports.ts for the fixed ports both sides agree on.
export default defineConfig({
  test: {
    include: ["tests/api/**/*.test.ts"],
    fileParallelism: false,
    env: loadDevVars(),
  },
})
