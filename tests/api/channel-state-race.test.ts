import { mkdtempSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { getPlatformProxy, type PlatformProxy } from "wrangler"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { applyLocalMigrations } from "../shared/setup/process-lifecycle"
import { Database } from "../../apps/api/src/db"
import {
  applyEvent,
  applySnapshot,
} from "../../apps/api/src/features/channel-state/service"

// The worker under test is a separate process, so this drives the module
// in-process against a real local D1 migrated by the same helper as global-setup.

const REPO_ROOT = resolve(__dirname, "../..")
const ID = "100"
const EVENT_AT = "2024-06-01T14:00:00.000Z"

let proxy: PlatformProxy<{ DB: D1Database }>
let persistDir: string
let d1: D1Database
let db: Database

beforeAll(async () => {
  persistDir = mkdtempSync(join(tmpdir(), "channel-state-race-"))
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
  expect(results.map((r) => r.name)).toContain("channel_state")
  db = new Database(d1)
})

afterAll(async () => {
  await proxy.dispose()
  rmSync(persistDir, { recursive: true, force: true })
})

describe("Snapshot commit racing an Event (#176, ADR 0033)", () => {
  it("should leave the Event's stream_type and updated_from_event_at when it lands between the Snapshot read and commit", async () => {
    // Snapshot reads the row (none yet), as a follow sync's fetch phase does.
    const snapshot = await applySnapshot(db, [ID], [], new Date().toISOString())

    // A rerun stream.online lands before the deferred commit.
    await applyEvent(
      db,
      {
        messageId: "race_m1",
        messageTimestamp: EVENT_AT,
        receivedAt: EVENT_AT,
        eventType: "stream.online",
        event: {
          id: "s1",
          broadcaster_user_id: ID,
          broadcaster_user_login: "a",
          broadcaster_user_name: "A",
          type: "rerun",
          started_at: EVENT_AT,
        },
      },
      undefined,
    )

    await snapshot.commit()

    const row = await db.channelState.findByBroadcasterUserId(ID)
    expect(row?.stream_type).toBe("rerun")
    expect(row?.updated_from_event_at).toBe(EVENT_AT)
    expect(row?.is_live).toBe(true)
  })
})

describe("Event write atomicity (ADR 0034)", () => {
  it("should leave Channel State untouched when the State Change insert fails, so a retry still produces the change", async () => {
    const id = "300"
    const message = {
      messageId: "atomic_m1",
      messageTimestamp: EVENT_AT,
      receivedAt: EVENT_AT,
      eventType: "stream.online" as const,
      event: {
        id: "s3",
        broadcaster_user_id: id,
        broadcaster_user_login: "c",
        broadcaster_user_name: "C",
        type: "live",
        started_at: EVENT_AT,
      },
    }
    // Stands in for a D1 failure on the second write of the old two-call flow.
    await d1.exec(
      "CREATE TRIGGER fail_change BEFORE INSERT ON channel_state_changes BEGIN SELECT RAISE(ABORT, 'injected'); END",
    )
    await expect(applyEvent(db, message, undefined)).rejects.toThrow()
    expect(await db.channelState.findByBroadcasterUserId(id)).toBeNull()

    await d1.exec("DROP TRIGGER fail_change")
    const change = await applyEvent(db, message, undefined)
    expect(change?.change_type).toBe("stream_started")
    expect((await db.channelState.findByBroadcasterUserId(id))?.is_live).toBe(
      true,
    )
  })
})
