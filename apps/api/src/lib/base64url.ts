// tsconfig's ES2022 target doesn't type these yet; workerd implements them natively.
/// <reference lib="esnext.typedarrays" />

/** Unpadded, as JWT/JWK (RFC 7515) and Web Push keys expect. */
export function base64UrlEncode(bytes: Uint8Array): string {
  return bytes.toBase64({ alphabet: "base64url", omitPadding: true })
}

/** Accepts padded and unpadded input ("loose" last-chunk handling is the default). */
export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.fromBase64(value, { alphabet: "base64url" })
}
