/**
 * A throwaway VAPID key pair for a test run. `.env.development`'s placeholder
 * VAPID values pass env.ts's length checks but aren't a real P-256 key pair,
 * and both the API's Web Push send path and its `GET /push/vapid-public-key`
 * endpoint now reject them — the push tests need keys that import cleanly.
 */
export async function generateTestVapidKeys() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )
  const publicRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", pair.publicKey),
  )
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey)
  return {
    publicKey: Buffer.from(publicRaw).toString("base64url"),
    privateKey: privateJwk.d as string,
  }
}
