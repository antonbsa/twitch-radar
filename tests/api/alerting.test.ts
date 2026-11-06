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

function configure(
  environment: AppConfig["environment"],
  url?: string,
  sentryOrg?: string,
) {
  configureAlerting({
    environment,
    slackAlertWebhookUrl: url,
    sentryOrg,
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
    expect(body.text).toContain("*[production] job failed*")
    expect(body.text).toContain("`row 0`")
    expect(body.text).toContain("+4 more failures this invocation")
  })

  it("shows the Drizzle cause and a truncated query, not the wrapper", async () => {
    configure("production", WEBHOOK)
    const sql = `select * from t where a <= 1 ${"x".repeat(600)}`
    const wrapped = new Error(`Failed query: ${sql}\nparams: 1`, {
      cause: new Error("D1_ERROR: no such column: a"),
    })

    await collectFailures(async () => recordFailure("job failed", wrapped))

    const { text } = JSON.parse(fetchMock.mock.calls[0][1].body)
    const [headline, cause, query] = text.split("\n")
    expect(headline).toBe(":rotating_light: *[production] job failed*")
    expect(cause).toBe("`D1_ERROR: no such column: a`")
    expect(query).toMatch(
      /^```Failed query: select \* from t where a &lt;= 1 x+…```$/,
    )
    expect(query.length).toBeLessThan(540)
    expect(text).not.toContain("params: 1")
  })

  it("never posts a short query's bound params", async () => {
    configure("production", WEBHOOK)
    const wrapped = new Error("Failed query: select 1\nparams: tok_secret", {
      cause: new Error("D1_ERROR: boom"),
    })

    await collectFailures(async () => recordFailure("job failed", wrapped))

    const { text } = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(text).toContain("Failed query: select 1")
    expect(text).not.toContain("tok_secret")
  })

  it("escapes Slack control characters and backticks", async () => {
    configure("production", WEBHOOK)
    await collectFailures(async () =>
      recordFailure("a <b>", new Error("x < y & `z` > w")),
    )
    const { text } = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(text).toContain("*[production] a &lt;b&gt;*")
    expect(text).toContain("`x &lt; y &amp; 'z' &gt; w`")
  })

  it("lists up to 3 distinct sources of the other failures", async () => {
    configure("production", WEBHOOK)
    await collectFailures(async () => {
      for (const source of ["first", "A", "A", "B", "C", "D", "E"])
        recordFailure(source, new Error("boom"))
    })
    const { text } = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(text).toContain("+6 more failures this invocation: `A`, `B`, `C`")
    expect(text).not.toContain("`D`")
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
    ["D1_ERROR: Currently processing a long-running export.", "d1-export-lock"],
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

    it("links the Slack alert to the Sentry event when org and DSN exist", async () => {
      configure("production", WEBHOOK, "myorg")
      await collectFailures(
        async () => recordFailure("job failed", new Error("boom")),
        cron,
      )
      // Let the Sentry send finish so it can't leak into the next test's fetch mock.
      await vi.waitFor(() => expect(sentryBody()).toBeDefined())
      const slack = fetchMock.mock.calls.find(([u]) => u === WEBHOOK)
      const { text } = JSON.parse(slack![1].body)
      expect(text).toMatch(
        /<https:\/\/myorg\.sentry\.io\/issues\/\?query=event\.id%3A[0-9a-f]{32}\|View in Sentry>$/,
      )
    })

    it("omits the Sentry link without an org", async () => {
      await collectFailures(
        async () => recordFailure("job failed", new Error("boom")),
        cron,
      )
      // Let the Sentry send finish so it can't leak into the next test's fetch mock.
      await vi.waitFor(() => expect(sentryBody()).toBeDefined())
      const slack = fetchMock.mock.calls.find(([u]) => u === WEBHOOK)
      expect(JSON.parse(slack![1].body).text).not.toContain("sentry.io")
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
