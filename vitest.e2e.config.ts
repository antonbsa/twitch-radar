import { defineConfig } from "vitest/config"
import { loadDevVars } from "./dev-env"
import { E2E_WEB_URL } from "./tests/web/e2e/setup/ports"

export default defineConfig({
  test: {
    include: ["tests/web/unit/**/*.test.ts", "tests/web/e2e/**/*.spec.ts"],
    globalSetup: ["tests/web/e2e/setup/global-setup.ts"],
    // One shared app instance for the whole run — serial avoids state races
    // against the real D1/KV bindings the test-seam endpoint writes to.
    fileParallelism: false,
    testTimeout: 30_000,
    // One retry on CI absorbs rare browser-timing flakes; locally a failure
    // stays visible. Don't add it to the API or unit tiers, which are deterministic.
    retry: process.env.CI ? 1 : 0,
    hookTimeout: 30_000,
    env: {
      ...loadDevVars(),
      // Match this tier's own vite port; test-seam-client.ts reads it.
      PUBLIC_URL: E2E_WEB_URL,
    },
  },
})
