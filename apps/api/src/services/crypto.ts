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

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

function base64urlToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const std = b64.replace(/-/g, "+").replace(/_/g, "/")
  const padded = std.padEnd(std.length + ((4 - (std.length % 4)) % 4), "=")
  const binary = atob(padded)
  const buf = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

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
  return `${bytesToBase64url(iv)}:${bytesToBase64url(new Uint8Array(ct))}`
}

export async function decryptToken(
  encrypted: string,
  secret: string,
): Promise<string> {
  const sep = encrypted.indexOf(":")
  if (sep === -1) throw new Error("Invalid encrypted token format")
  const key = await deriveKey(secret)
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64urlToBytes(encrypted.slice(0, sep)) },
    key,
    base64urlToBytes(encrypted.slice(sep + 1)),
  )
  return new TextDecoder().decode(plaintext)
}
