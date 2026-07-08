import { describe, expect, it } from "vitest"
import { urlBase64ToUint8Array } from "../../../apps/web/src/lib/push"

describe("urlBase64ToUint8Array", () => {
  it("should decode plain base64 content", () => {
    // "Man" → TWFu
    expect(Array.from(urlBase64ToUint8Array("TWFu"))).toEqual([77, 97, 110])
  })

  it("should restore missing padding", () => {
    // "Ma" → TWE= without its padding char
    expect(Array.from(urlBase64ToUint8Array("TWE"))).toEqual([77, 97])
  })

  it("should map the base64url alphabet (-, _) to (+, /)", () => {
    // 0xfb 0xff → base64 "+/8=" → base64url "-_8"
    expect(Array.from(urlBase64ToUint8Array("-_8"))).toEqual([251, 255])
  })

  it("should decode an 87-char VAPID public key to 65 raw bytes", () => {
    const key = "A".repeat(87)
    const bytes = urlBase64ToUint8Array(key)
    expect(bytes).toHaveLength(65)
    expect(bytes.every((b) => b === 0)).toBe(true)
  })
})
