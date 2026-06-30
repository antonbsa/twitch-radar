import { describe, expect, it } from "vitest"
import worker from "../../apps/api/src"
import type { Env } from "../../apps/api/src/env"
import { createMigratedD1 } from "./utils/sqlite-d1"

function createEnv(db: D1Database): Env {
  return {
    ...(process.env as unknown as Env),
    DB: db,
    APP_CACHE: {} as KVNamespace,
    TWITCH_EVENTS_QUEUE: {} as Queue,
    NOTIFICATION_JOBS_QUEUE: {} as Queue,
  }
}

describe("Worker routing", () => {
  it("returns a successful health response", async () => {
    const env = createEnv(await createMigratedD1())
    const response = await worker.fetch(
      new Request("http://localhost/api/health"),
      env,
      createExecutionContext(),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: "twitch-radar-api",
      checks: {
        d1: "ok",
      },
    })
  })

  it("returns the standard JSON error shape", async () => {
    const env = createEnv(await createMigratedD1())
    const response = await worker.fetch(
      new Request("http://localhost/api/missing"),
      env,
      createExecutionContext(),
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "not_found",
        message: "Route not found",
      },
    })
  })
})

function createExecutionContext(): ExecutionContext {
  return {
    waitUntil() {},
    passThroughOnException() {},
  } as unknown as ExecutionContext
}
