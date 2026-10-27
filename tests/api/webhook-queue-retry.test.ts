import { beforeEach, describe, expect, it, vi } from "vitest"
import { handleEventsubWebhook } from "../../apps/api/src/features/eventsub/webhooks"
import { ApiError } from "../../apps/api/src/http/errors"

// Direct-import test: the worker under test can't be made to fail its queue
// send, so the handler runs against a fake context.

vi.mock("../../apps/api/src/features/eventsub/verify", () => ({
  verifyEventsubSignature: async () => true,
}))

const OVERLOADED = new Error("Queue is overloaded. Please back off. (10250)")

function context(send: ReturnType<typeof vi.fn>) {
  const headers: Record<string, string> = {
    "Twitch-Eventsub-Message-Id": "m1",
    "Twitch-Eventsub-Message-Type": "notification",
    "Twitch-Eventsub-Message-Timestamp": new Date().toISOString(),
    "Twitch-Eventsub-Message-Signature": "sha256=x",
  }
  return {
    req: {
      text: async () =>
        JSON.stringify({ subscription: { type: "stream.online" }, event: {} }),
      header: (name: string) => headers[name],
    },
    var: { config: { eventsubWebhookSecret: "s" } },
    env: { TWITCH_EVENTS_QUEUE: { send } },
    executionCtx: { waitUntil: () => {} },
  } as never
}

describe("EventSub webhook queue overload", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("retries a transient queue error once and acks", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(OVERLOADED)
      .mockResolvedValue(undefined)
    const response = await handleEventsubWebhook(context(send))
    expect(response.status).toBe(204)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it("answers 503 so Twitch redelivers when the retry fails too", async () => {
    const send = vi.fn().mockRejectedValue(OVERLOADED)
    await expect(handleEventsubWebhook(context(send))).rejects.toMatchObject({
      status: 503,
    })
    expect(send).toHaveBeenCalledTimes(2)
  })

  it("does not retry a non-transient send error", async () => {
    const send = vi.fn().mockRejectedValue(new Error("boom"))
    const error = await handleEventsubWebhook(context(send)).catch((e) => e)
    expect(error).not.toBeInstanceOf(ApiError)
    expect(send).toHaveBeenCalledTimes(1)
  })
})
