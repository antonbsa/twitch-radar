import { existsSync, readFileSync } from "fs"
import { resolve } from "path"
import { parseEnv } from "./apps/api/src/env"
import type { Env } from "./apps/api/src/env"
import { defineConfig } from "vitest/config"

function parseDevVars(filePath: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(filePath, "utf-8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const idx = line.indexOf("=")
        return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()]
      }),
  )
}

const localPath = resolve(import.meta.dirname, ".env.local")

const devVars = {
  ...parseDevVars(resolve(import.meta.dirname, ".env.development")),
  ...(existsSync(localPath) ? parseDevVars(localPath) : {}),
}

parseEnv(devVars as unknown as Env)

export default defineConfig({
  test: {
    env: devVars,
  },
})
