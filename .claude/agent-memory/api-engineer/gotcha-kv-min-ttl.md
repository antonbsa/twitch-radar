---
name: gotcha-kv-min-ttl
description: Cloudflare KV rejects expirationTtl below 60 seconds — short cooldown/dedupe keys must use 60s minimum, not whatever feels UX-appropriate
metadata:
  type: feedback
---

Cloudflare KV's `put(key, value, { expirationTtl })` rejects any TTL under 60 seconds outright: `KV PUT failed: 400 Invalid expiration_ttl of 30. Expiration TTL must be at least 60.` This only surfaces at runtime against the real `wrangler dev` worker (`tests/api` tier) — it is not a TypeScript-level constraint, so `npm run typecheck`/`npm run lint` both pass with an invalid TTL and the route silently 500s.

**Why:** discovered implementing a 30s per-user cooldown key for `POST /api/sync/follows` (issue #34) — chose 30s from the issue's own suggested "30-60s" range, and it 500'd every request until traced to this KV floor.

**How to apply:** any new KV-backed TTL'd key (cooldowns, short-lived dedupe, etc.) must use `expirationTtl >= 60`. If a shorter effective window is wanted, don't rely on KV's own expiry — store a timestamp and TTL at 60s, then compute "still active" by comparing elapsed time against your own shorter threshold instead (this is what `getSyncCooldownRemaining` does in `apps/api/src/services/sync-cooldown.ts`). Always verify a new KV TTL choice by actually running the `tests/api` tier once, not just typecheck/lint — the failure mode is silent 500s, not a type error.
