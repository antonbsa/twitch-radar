import { expect, test } from "vitest"

// `app.ts` reads this build-time constant (ADR 0045); `false` keeps the
// test-seam and sandbox routes out of the route list, which is what the guard
// wants to exclude anyway.
Object.assign(globalThis, { __NON_PRODUCTION_FEATURES__: false })

test("every route has a response contract entry and every entry has a route", async () => {
  const { buildApp } = await import("../../apps/api/src/app")
  const { ROUTE_CONTRACTS } =
    await import("../../apps/api/src/contracts/registry")

  const registered = new Set(Object.keys(ROUTE_CONTRACTS))
  const registeredPaths = [...registered].map((k) => k.split(" ")[1])

  // Only the global middleware, the CORS preflight and the per-router auth
  // guard (`ALL /api/<prefix>/*`, for a prefix with registered routes) may use
  // ALL/OPTIONS; any other one would be a real route the guard can't key.
  const isInfra = (r: { method: string; path: string }) =>
    (r.method === "ALL" && r.path === "/*") ||
    (r.method === "OPTIONS" && r.path === "/*") ||
    (r.method === "ALL" &&
      /^\/api\/[^/*:]+\/\*$/.test(r.path) &&
      registeredPaths.some((p) => p.startsWith(r.path.slice(0, -1))))
  const all = buildApp().routes
  expect(
    all
      .filter(
        (r) => (r.method === "ALL" || r.method === "OPTIONS") && !isInfra(r),
      )
      .map((r) => `${r.method} ${r.path}`),
  ).toEqual([])
  const routes = new Set(
    all
      .filter((r) => r.method !== "ALL" && r.method !== "OPTIONS")
      .map((r) => `${r.method} ${r.path}`),
  )

  const withoutContract = [...routes].filter((r) => !registered.has(r))
  const withoutRoute = [...registered].filter((r) => !routes.has(r))
  expect({ withoutContract, withoutRoute }).toEqual({
    withoutContract: [],
    withoutRoute: [],
  })
})
