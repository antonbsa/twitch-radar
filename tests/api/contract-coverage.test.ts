import { expect, test } from "vitest"

// `app.ts` reads this build-time constant (ADR 0045); `false` keeps the
// test-seam and sandbox routes out of the route list, which is what the guard
// wants to exclude anyway.
Object.assign(globalThis, { __NON_PRODUCTION_FEATURES__: false })

test("every route has a response contract entry and every entry has a route", async () => {
  const { buildApp } = await import("../../apps/api/src/app")
  const { ROUTE_CONTRACTS } =
    await import("../../apps/api/src/contracts/registry")

  const all = buildApp().routes
  // Middleware mounts as `ALL` on a `/*` path and is skipped below; an `ALL`
  // route on any other path would be a real route the guard can't key.
  expect(
    all.filter((r) => r.method === "ALL" && !r.path.endsWith("/*")),
  ).toEqual([])
  // Skip middleware and the CORS preflight catch-all.
  const routes = new Set(
    all
      .filter((r) => r.method !== "ALL" && r.method !== "OPTIONS")
      .map((r) => `${r.method} ${r.path}`),
  )
  const registered = new Set(Object.keys(ROUTE_CONTRACTS))

  const withoutContract = [...routes].filter((r) => !registered.has(r))
  const withoutRoute = [...registered].filter((r) => !routes.has(r))
  expect({ withoutContract, withoutRoute }).toEqual({
    withoutContract: [],
    withoutRoute: [],
  })
})
