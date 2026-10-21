import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { getPlatformProxy, type PlatformProxy } from "wrangler"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Database } from "../../apps/api/src/db"
import {
  applyEvent,
  applySnapshot,
} from "../../apps/api/src/features/channel-state/service"

// The worker under test is a separate process, so this drives the module
// in-process against a real (Miniflare) D1 with the repo's migrations applied.

const MIGRATIONS = join(__dirname, "../../infra/migrations")
const ID = "100"
const EVENT_AT = "2024-06-01T14:00:00.000Z"

let proxy: PlatformProxy<{ DB: D1Database }>
let persistDir: string
let d1: D1Database
let db: Database

beforeAll(async () => {
  persistDir = mkdtempSync(join(tmpdir(), "channel-state-race-"))
  proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: join(__dirname, "../../apps/api/wrangler.jsonc"),
    persist: { path: persistDir },
  })
  d1 = proxy.env.DB
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
  for (const file of files) {
    const statements = readFileSync(join(MIGRATIONS, file), "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean)
    for (const statement of statements) {
      await d1.prepare(statement).run()
    }
  }
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
