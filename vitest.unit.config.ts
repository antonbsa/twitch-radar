import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// Web unit tier: pure-function tests, no browser or server, so no globalSetup
// and default parallelism/timeouts (ADR 0064).
export default defineConfig({
  resolve: {
    // Mirrors apps/web/vite.config.ts so a value import through `@/...` in
    // tested source resolves (today only type imports do).
    alias: { "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)) },
  },
  test: {
    include: ["tests/web/unit/**/*.test.ts"],
    // Setting reporters replaces the defaults, so keep `default`; the html
    // report is what CI publishes on failure (ADR 0060).
    reporters: [
      "default",
      ...(process.env.CI ? ["github-actions"] : []),
      "html",
    ],
    outputFile: { html: "test-results/unit/report/index.html" },
  },
})
