import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AppConfig, Env } from "../../apps/api/src/env"
import {
  collectFailures,
  configureAlerting,
  recordFailure,
  sentryOptions,
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
