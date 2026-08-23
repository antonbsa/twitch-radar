// Cheap per-user guard against mashing the "Sync" button, not a general rate limiter.
// 60s is Cloudflare KV's floor for expirationTtl - a shorter value is rejected outright.
const SYNC_COOLDOWN_TTL_S = 60

function cooldownKey(userId: string): string {
  return `sync_cooldown:${userId}`
}

/**
 * Returns the remaining cooldown in whole seconds if the user is still
 * throttled, or null if they're clear to sync.
 */
export async function getSyncCooldownRemaining(
  kv: KVNamespace,
  userId: string,
): Promise<number | null> {
  const raw = await kv.get(cooldownKey(userId))
  if (!raw) return null

  const startedAtMs = Number(raw)
  const elapsedS = (Date.now() - startedAtMs) / 1000
  const remainingS = Math.ceil(SYNC_COOLDOWN_TTL_S - elapsedS)
  return remainingS > 0 ? remainingS : null
}

/** Starts (or restarts) the cooldown window for a user. */
export async function startSyncCooldown(
  kv: KVNamespace,
  userId: string,
): Promise<void> {
  await kv.put(cooldownKey(userId), String(Date.now()), {
    expirationTtl: SYNC_COOLDOWN_TTL_S,
  })
}

/** Test-seam helper: clears a single user's cooldown so tests stay isolated. */
export async function clearSyncCooldown(
  kv: KVNamespace,
  userId: string,
): Promise<void> {
  await kv.delete(cooldownKey(userId))
}
