---
name: gotcha-e2e-user-id-kv-leak
description: Any new user-keyed KV state (not just sessions) must be cleared by the /api/__test__/reset seam, or it leaks between tests sharing the fixed E2E_USER_ID
metadata:
  type: feedback
---

Most `tests/api` test files never override the seeded user's `id`, so they all reuse the fixed `E2E_USER_ID` ("usr_e2e") from `apps/api/src/http/routes/_tests.ts`. `beforeEach(() => orchestrator.clearDatabase())` wipes D1 tables and KV `session:*` keys (via `deleteAllSessions`), but it does **not** know about any other KV key pattern you introduce.

**Why:** adding a per-user KV cooldown key (`sync_cooldown:{userId}`, see [[gotcha-kv-min-ttl]]) for the sync rate-limit sub-task (issue #34) caused cross-test 429s once the TTL bug above was fixed — a cooldown set by one `it()` block was still live for the next one, since both used `usr_e2e` and reset didn't touch that key.

**How to apply:** any new user-keyed (or otherwise test-visible) KV namespace added to `apps/api/src/services/` must get matching cleanup added to both reset paths in `apps/api/src/http/routes/_tests.ts`: the `scope: "all"` branch (prefix-scan delete, mirroring `deleteAllSessions`) and the scoped `E2E_USER_ID`-only branch near the bottom of `handleTestReset` (single-key delete, mirroring `deleteSessionsForUser`). Confirmed by running the full `npm run test:api` suite, not just the new test file in isolation — a single-file run can pass while the full suite (different `it()` ordering/timing across files) exposes the leak.
