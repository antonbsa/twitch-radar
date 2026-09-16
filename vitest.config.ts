import { defineConfig } from "vitest/config"
import { loadDevVars } from "./dev-env"

// API tier: real HTTP requests against a worker + mock Twitch server. The
// setup boots before tests and tears down after; fixed ports are defined in
// tests/api/setup/ports.ts.
export default defineConfig({
  test: {
    include: ["tests/api/**/*.test.ts"],
    globalSetup: ["tests/api/setup/global-setup.ts"],
    fileParallelism: false,
    // waitForInspect polls the real pipeline and defaults to a 10s timeout.
    // Vitest's default 5s test timeout is shorter, so set both timeouts
    // above that budget to allow the richer inspect diagnostics to surface.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    env: loadDevVars(),
  },
})
