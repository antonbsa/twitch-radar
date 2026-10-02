import { base64UrlDecode, base64UrlEncode } from "./base64url"

async function deriveKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  )
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ])
}

/** @returns `<iv>:<ciphertext>`, both base64url (AES-GCM, key derived from `secret`). */
export async function encryptToken(
  plaintext: string,
  secret: string,
): Promise<string> {
  const key = await deriveKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  return `${base64UrlEncode(iv)}:${base64UrlEncode(new Uint8Array(ct))}`
}

/** Inverse of `encryptToken`. Throws on a malformed value or a failed AES-GCM auth check (tampered value or wrong key). */
export async function decryptToken(
  encrypted: string,
  secret: string,
): Promise<string> {
  const sep = encrypted.indexOf(":")
  if (sep === -1) throw new Error("Invalid encrypted token format")
  const key = await deriveKey(secret)
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlDecode(encrypted.slice(0, sep)) },
    key,
    base64UrlDecode(encrypted.slice(sep + 1)),
  )
  return new TextDecoder().decode(plaintext)
}
