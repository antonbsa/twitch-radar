import { defineConfig } from "vitest/config"
import { loadDevVars } from "./dev-env"

export default defineConfig({
  test: {
    include: ["tests/web/unit/**/*.test.ts", "tests/web/e2e/**/*.spec.ts"],
    globalSetup: ["tests/web/e2e/setup/global-setup.ts"],
    // One shared app instance for the whole run — serial avoids state races
    // against the real D1/KV bindings the test-seam endpoint writes to.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: loadDevVars(),
  },
})
