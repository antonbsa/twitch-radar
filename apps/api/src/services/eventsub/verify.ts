// Twitch EventSub webhook signature verification (ADR 0032).
// https://dev.twitch.tv/docs/eventsub/handling-webhook-events/#verifying-the-event-message

const encoder = new TextEncoder()

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

// Constant-time comparison so signature checks don't leak match length.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Verifies the `Twitch-Eventsub-Message-Signature` header: HMAC-SHA256 over
 * messageId + timestamp + raw body, hex-encoded with a `sha256=` prefix.
 * The raw body must be the exact bytes Twitch sent — parse JSON only after
 * this passes.
 */
export async function verifyEventsubSignature(
  secret: string,
  messageId: string,
  messageTimestamp: string,
  rawBody: string,
  signatureHeader: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(messageId + messageTimestamp + rawBody),
  )
  return timingSafeEqual(`sha256=${toHex(mac)}`, signatureHeader)
}
