import { afterAll, beforeEach, describe, it } from "vitest"
import { orchestrator } from "./setup/orchestrator"
import { HealthResponse } from "../../apps/api/src/contracts/health"
import { expectApiError, expectConforms } from "./setup/contract"

beforeEach(async () => {
  await orchestrator.clearDatabase()
})

afterAll(async () => {
  await orchestrator.clearDatabase()
})

describe("GET /api/health", () => {
  it("should return successful health response", async () => {
    const res = await fetch(`${orchestrator.baseUrl}/api/health`)
    await expectConforms(res, 200, HealthResponse)
  })
})

describe("Worker routing", () => {
  it("should return 404 for unknown routes", async () => {
    const res = await fetch(`${orchestrator.baseUrl}/api/missing`)
    await expectApiError(res, 404, "not_found")
  })

  it("should return 405 for wrong method on a known route", async () => {
    const res = await fetch(`${orchestrator.baseUrl}/api/sync/follows`)
    await expectApiError(res, 405, "method_not_allowed")
  })
})
