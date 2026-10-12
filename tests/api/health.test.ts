import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { orchestrator } from "./setup/orchestrator"

beforeEach(async () => {
  await orchestrator.clearDatabase()
})

afterAll(async () => {
  await orchestrator.clearDatabase()
})

describe("GET /api/health", () => {
  it("should return successful health response", async () => {
    const res = await fetch(`${orchestrator.baseUrl}/api/health`)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      service: "twitch-radar-api",
      checks: { d1: "ok" },
    })
  })
})

describe("Worker routing", () => {
  it("should return 404 for unknown routes", async () => {
    const res = await fetch(`${orchestrator.baseUrl}/api/missing`)
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "not_found" },
    })
  })

  it("should return 405 for wrong method on a known route", async () => {
    const res = await fetch(`${orchestrator.baseUrl}/api/sync/follows`)
    expect(res.status).toBe(405)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "method_not_allowed" },
    })
  })
})
