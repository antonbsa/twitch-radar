import { mkdtempSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { getPlatformProxy, type PlatformProxy } from "wrangler"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { applyLocalMigrations } from "../shared/setup/process-lifecycle"
import { Database } from "../../apps/api/src/db"
import { sweepNotificationSnoozes } from "../../apps/api/src/features/notifications/snooze-sweep"
import type { NotificationJobMessage } from "../../apps/api/src/features/notifications/types"

// Two sweeps reading the same due snooze before either finishes is timing
// between the sweep's own steps, which HTTP can't trigger, so this runs
// in-process against a real local D1 (tests/api/AGENTS.md).

const REPO_ROOT = resolve(__dirname, "../..")
const NOW = new Date().toISOString()

let proxy: PlatformProxy<{ DB: D1Database }>
let persistDir: string
let d1: D1Database
let db: Database

beforeAll(async () => {
  persistDir = mkdtempSync(join(tmpdir(), "snooze-sweep-replay-"))
  await applyLocalMigrations(REPO_ROOT, persistDir)
  proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: join(REPO_ROOT, "apps/api/wrangler.jsonc"),
    // `wrangler --persist-to <dir>` writes under <dir>/v3; the proxy wants that root.
    persist: { path: join(persistDir, "v3") },
  })
  d1 = proxy.env.DB
  // Fail loudly if the proxy's D1 isn't the one the migrations went to.
  const { results } = await d1
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all<{ name: string }>()
  expect(results.map((r) => r.name)).toContain("notification_snoozes")
  db = new Database(d1)

  await d1.batch([
    d1
      .prepare(
        "INSERT INTO users (id, twitch_user_id, twitch_login, twitch_display_name, created_at, updated_at) VALUES ('usr_1', 't_1', 'viewer', 'Viewer', ?1, ?1)",
      )
      .bind(NOW),
    d1
      .prepare(
        "INSERT INTO channel_state (broadcaster_user_id, is_live, stream_id, category_id, category_name, stream_type, updated_at) VALUES ('200', 1, 's1', '27471', 'Chess', 'live', ?1)",
      )
      .bind(NOW),
    d1
      .prepare(
        "INSERT INTO notification_snoozes (id, user_id, broadcaster_user_id, category_id, fire_at, status, created_at) VALUES ('nsnz_1', 'usr_1', '200', '27471', ?1, 'pending', ?1)",
      )
      .bind(NOW),
  ])
})

afterAll(async () => {
  await proxy.dispose()
  rmSync(persistDir, { recursive: true, force: true })
})

describe("snooze sweep replay guard", () => {
  it("should queue one reminder when two sweeps pick up the same due snooze", async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const queue = { send } as unknown as Queue<NotificationJobMessage>

    await Promise.all([
      sweepNotificationSnoozes(db, queue),
      sweepNotificationSnoozes(db, queue),
    ])

    expect(send).toHaveBeenCalledTimes(1)
    const { results } = await d1
      .prepare(
        "SELECT id FROM notification_deliveries WHERE trigger_type = 'snooze_reminder'",
      )
      .all()
    expect(results).toHaveLength(1)
    const snooze = await d1
      .prepare("SELECT status FROM notification_snoozes WHERE id = 'nsnz_1'")
      .first<{ status: string }>()
    expect(snooze?.status).toBe("fired")
  })
})
