import type { AppConfig } from "../../env"
import type { PushSubscriptionRecord } from "../../types"

// How long the push service should retain an undelivered message. Category
// alerts are time-sensitive — after an hour the stream has likely moved on,
// so delivering later would only confuse (ADR 0035).
const PUSH_TTL_SECONDS = 60 * 60

// RFC 8292 caps VAPID JWT lifetime at 24h; 12h leaves ample clock-skew room.
const VAPID_JWT_LIFETIME_SECONDS = 12 * 60 * 60

export type WebPushSendResult =
  | { ok: true; status: number }
  | {
      ok: false
      status: number | null
      // 404/410 from the push service: the subscription no longer exists and
      // must be revoked locally (ADR 0027).
      endpointGone: boolean
      error: string
    }

// WebCrypto's BufferSource inputs require views over a plain ArrayBuffer.
type Bytes = Uint8Array<ArrayBuffer>

const encoder = new TextEncoder()

function utf8(value: string): Bytes {
  return encoder.encode(value) as Bytes
}

function base64UrlDecode(value: string): Bytes {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

function concatBytes(...parts: Uint8Array[]): Bytes {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/**
 * The VAPID key pair is stored as the raw formats `web-push
 * generate-vapid-keys` emits: a 65-byte uncompressed P-256 point (public)
 * and a 32-byte scalar (private), both base64url. WebCrypto imports private
 * EC keys only as JWK/PKCS8, so rebuild the JWK from the two raw values.
 */
export async function importVapidSigningKey(
  config: AppConfig,
): Promise<CryptoKey> {
  const publicKeyBytes = base64UrlDecode(config.vapidPublicKey)
  try {
    return await crypto.subtle.importKey(
      "jwk",
      {
        kty: "EC",
        crv: "P-256",
        x: base64UrlEncode(publicKeyBytes.slice(1, 33)),
        y: base64UrlEncode(publicKeyBytes.slice(33, 65)),
        d: config.vapidPrivateKey,
      },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    )
  } catch (error) {
    // .env.development ships empty/placeholder VAPID values on purpose (see
    // AGENTS.md "Env Vars: Single Source Of Truth") — they pass env.ts's
    // length checks but aren't a real P-256 key pair, so WebCrypto rejects
    // them here with an opaque DOMException. Surface the actual fix instead.
    throw new Error(
      'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are missing or not a valid key pair. Run `npm run vapid` to generate a real one, then add both values to .env.local (see README § "Testing Web Push Notifications").',
      { cause: error },
    )
  }
}

/** RFC 8292 `vapid t=<jwt>, k=<public key>` Authorization header value. */
async function buildVapidAuthorization(
  config: AppConfig,
  endpoint: string,
): Promise<string> {
  const header = base64UrlEncode(
    utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })),
  )
  const claims = base64UrlEncode(
    utf8(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + VAPID_JWT_LIFETIME_SECONDS,
        sub: config.vapidSubject,
      }),
    ),
  )
  const signingKey = await importVapidSigningKey(config)
  // WebCrypto ECDSA emits the raw 64-byte r||s concatenation JWS expects.
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signingKey,
      utf8(`${header}.${claims}`),
    ),
  )
  const jwt = `${header}.${claims}.${base64UrlEncode(signature)}`
  return `vapid t=${jwt}, k=${config.vapidPublicKey}`
}

async function hkdf(
  salt: Bytes,
  ikm: Bytes,
  info: Bytes,
  lengthBytes: number,
): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveBits",
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    lengthBytes * 8,
  )
  return new Uint8Array(bits)
}

/**
 * RFC 8291 aes128gcm message encryption: ECDH over the subscription's
 * `p256dh` key with a fresh ephemeral key pair, HKDF chained through the
 * `auth` secret, and a single AES-128-GCM record carrying the whole payload.
 */
async function encryptPayload(
  p256dh: string,
  auth: string,
  plaintext: string,
): Promise<Bytes> {
  const clientPublicBytes = base64UrlDecode(p256dh)
  const authSecret = base64UrlDecode(auth)

  const clientPublicKey = await crypto.subtle.importKey(
    "raw",
    clientPublicBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  )
  const serverKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  )
  const serverPublicBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeys.publicKey),
  )
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientPublicKey },
      serverKeys.privateKey,
      256,
    ),
  )

  const keyInfo = concatBytes(
    utf8("WebPush: info\0"),
    clientPublicBytes,
    serverPublicBytes,
  )
  const inputKeyMaterial = await hkdf(authSecret, sharedSecret, keyInfo, 32)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const contentEncryptionKey = await hkdf(
    salt,
    inputKeyMaterial,
    utf8("Content-Encoding: aes128gcm\0"),
    16,
  )
  const nonce = await hkdf(
    salt,
    inputKeyMaterial,
    utf8("Content-Encoding: nonce\0"),
    12,
  )

  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentEncryptionKey,
    "AES-GCM",
    false,
    ["encrypt"],
  )
  // 0x02 marks the final (only) record's padding delimiter.
  const record = concatBytes(utf8(plaintext), new Uint8Array([2]))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record),
  )

  // aes128gcm header: salt(16) | record size(4) | key id length(1) | key id.
  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, 4096)
  return concatBytes(
    salt,
    recordSize,
    new Uint8Array([serverPublicBytes.length]),
    serverPublicBytes,
    ciphertext,
  )
}

/**
 * Sends one Web Push message (ADR 0035). Never throws for delivery problems
 * — the result tells the caller whether the send worked and whether the
 * subscription is gone for good.
 */
export async function sendWebPush(
  config: AppConfig,
  subscription: Pick<PushSubscriptionRecord, "endpoint" | "p256dh" | "auth">,
  payload: string,
): Promise<WebPushSendResult> {
  let authorization: string
  try {
    authorization = await buildVapidAuthorization(config, subscription.endpoint)
  } catch (error) {
    // Server-side key problem — not the subscription's fault, don't revoke.
    return {
      ok: false,
      status: null,
      endpointGone: false,
      error: `VAPID signing failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  }

  let body: Bytes
  try {
    body = await encryptPayload(subscription.p256dh, subscription.auth, payload)
  } catch (error) {
    // Undecodable subscription keys can never succeed — treat like a dead
    // endpoint so the subscription gets revoked instead of retried forever.
    return {
      ok: false,
      status: null,
      endpointGone: true,
      error: `Push message encryption failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  }

  let response: Response
  try {
    response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        TTL: String(PUSH_TTL_SECONDS),
        Urgency: "high",
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        Authorization: authorization,
      },
      body,
    })
  } catch (error) {
    return {
      ok: false,
      status: null,
      endpointGone: false,
      error: `Push request failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  }

  if (response.ok) return { ok: true, status: response.status }
  // Push service rejection bodies (invalid VAPID, payload too large, etc.)
  // are always small text/JSON in practice; the truncation cap is a safety
  // net against a pathological response, not an expected path.
  const bodyText = (await response.text().catch(() => "")).slice(0, 2000)
  return {
    ok: false,
    status: response.status,
    endpointGone: response.status === 404 || response.status === 410,
    error: `Push service responded ${response.status}: ${bodyText}`,
  }
}
