import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AppConfig, Env } from "../../apps/api/src/env"
import {
  collectFailures,
  configureAlerting,
  recordFailure,
  sentryOptions,
  transientKind,
} from "../../apps/api/src/lib/alerting"

// Direct-import tests: the Slack POST is observed through a stubbed global
// fetch, since the worker under test runs with ENVIRONMENT=local and never
// reports.

const WEBHOOK = "https://hooks.slack.test/services/T/B/X"

function configure(environment: AppConfig["environment"], url?: string) {
  configureAlerting({
    environment,
    slackAlertWebhookUrl: url,
  } as AppConfig)
}

describe("alerting", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response("ok"))
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("sends one Slack message for N failures in one invocation", async () => {
    configure("production", WEBHOOK)

    await collectFailures(async () => {
      for (let i = 0; i < 5; i++)
        recordFailure("job failed", new Error(`row ${i}`))
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.text).toContain("[production] job failed: row 0")
    expect(body.text).toContain("+4 more")
  })

  it("sends nothing when the invocation had no failures", async () => {
    configure("production", WEBHOOK)
    await collectFailures(async () => {})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("sends nothing in local", async () => {
    configure("local", WEBHOOK)
    await collectFailures(async () => recordFailure("x", new Error("boom")))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("sends to Slack from preview when the webhook is set", async () => {
    configure("preview", WEBHOOK)
    await collectFailures(async () => recordFailure("x", new Error("boom")))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("sends nothing to Slack when the webhook is unset", async () => {
    configure("production")
    await collectFailures(async () => recordFailure("x", new Error("boom")))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not throw when Slack is unreachable", async () => {
    configure("production", WEBHOOK)
    fetchMock.mockRejectedValue(new Error("network down"))

    await expect(
      collectFailures(async () => {
        recordFailure("x", new Error("boom"))
        return "work result"
      }),
    ).resolves.toBe("work result")
  })

  it("reports a cron invocation's failure to Sentry through the lazy wrapper", async () => {
    configure("production")
    const cron = {
      controller: { cron: "* * * * *", scheduledTime: Date.now() },
      env: {
        ENVIRONMENT: "production",
        SENTRY_DSN: "https://k@o1.ingest.sentry.io/1",
      },
      ctx: { waitUntil: (p: Promise<unknown>) => p.catch(() => {}) },
    } as unknown as Parameters<typeof collectFailures>[1]

    await collectFailures(
      async () => recordFailure("job failed", new Error("boom")),
      cron,
    )
    await vi.waitFor(() => {
      const sentry = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("ingest.sentry.io"),
      )
      expect(sentry).toHaveLength(1)
      expect(String(sentry[0][1].body)).toContain("boom")
    })
  })

  it("keeps invocations' buffers separate when they overlap", async () => {
    configure("production", WEBHOOK)

    await Promise.all([
      collectFailures(async () => {
        await Promise.resolve()
        recordFailure("a", new Error("from a"))
      }),
      collectFailures(async () => recordFailure("b", new Error("from b"))),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe("sentryOptions", () => {
  const env = (vars: Record<string, string>) => vars as unknown as Env

  it("leaves the DSN unset in local even when one is configured", () => {
    expect(
      sentryOptions(env({ SENTRY_DSN: "https://k@o.ingest/1" })).dsn,
    ).toBeUndefined()
  })

  it("tags the configured environment and passes the DSN through", () => {
    const options = sentryOptions(
      env({ ENVIRONMENT: "production", SENTRY_DSN: "https://k@o.ingest/1" }),
    )
    expect(options).toMatchObject({
      dsn: "https://k@o.ingest/1",
      environment: "production",
    })
  })

  it("has no DSN when none is configured", () => {
    expect(sentryOptions(env({ ENVIRONMENT: "preview" })).dsn).toBeUndefined()
  })
})

describe("transient platform errors", () => {
  const d1 = (message: string) =>
    new Error(`Failed query: select 1\nparams: `, {
      cause: new Error(message),
    })

  it.each([
    [
      "D1_ERROR: D1 DB is overloaded. Requests queued for too long.",
      "d1-overloaded",
    ],
    ["D1_ERROR: Network connection lost.", "network-connection-lost"],
    ["D1_ERROR: internal error; reference = abc123", "d1-internal-error"],
    ["Queue is overloaded. Please back off. (10250)", "queue-overloaded"],
  ])("recognises %s through a Drizzle wrapper", (message, kind) => {
    expect(transientKind(d1(message))).toBe(kind)
  })

  it("does not treat a constraint error as transient", () => {
    expect(
      transientKind(d1("D1_ERROR: UNIQUE constraint failed: users.id")),
    ).toBeUndefined()
  })

  describe("reporting", () => {
    const fetchMock = vi.fn()
    const cron = {
      controller: { cron: "* * * * *", scheduledTime: Date.now() },
      env: {
        ENVIRONMENT: "production",
        SENTRY_DSN: "https://k@o1.ingest.sentry.io/1",
      },
      ctx: { waitUntil: (p: Promise<unknown>) => p.catch(() => {}) },
    } as unknown as Parameters<typeof collectFailures>[1]

    beforeEach(() => {
      fetchMock.mockReset().mockResolvedValue(new Response("ok"))
      vi.stubGlobal("fetch", fetchMock)
      vi.spyOn(console, "warn").mockImplementation(() => {})
      configure("production", WEBHOOK)
    })
    afterEach(() => {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    })

    const sentryBody = () =>
      fetchMock.mock.calls.find(([url]) =>
        String(url).includes("ingest.sentry.io"),
      )?.[1].body as string

    it("sends a transient failure to Sentry as a warning and skips Slack", async () => {
      await collectFailures(
        async () =>
          recordFailure("job failed", d1("D1_ERROR: Network connection lost.")),
        cron,
      )
      await vi.waitFor(() => expect(sentryBody()).toBeDefined())
      const body = sentryBody()
      expect(body).toContain('"level":"warning"')
      expect(body).toContain("transient-platform-error")
      expect(body).toContain("D1_ERROR: Network connection lost.")
      expect(fetchMock.mock.calls.some(([u]) => u === WEBHOOK)).toBe(false)
    })

    it("keeps a real failure an error, titled by the cause, with Slack", async () => {
      await collectFailures(
        async () =>
          recordFailure(
            "job failed",
            d1("D1_ERROR: UNIQUE constraint failed: users.id"),
          ),
        cron,
      )
      await vi.waitFor(() => expect(sentryBody()).toBeDefined())
      const body = sentryBody()
      expect(body).not.toContain('"level":"warning"')
      expect(body).toContain("UNIQUE constraint failed: users.id")
      expect(body).toContain("d1-query-failed")
      expect(fetchMock.mock.calls.some(([u]) => u === WEBHOOK)).toBe(true)
    })
  })
})
