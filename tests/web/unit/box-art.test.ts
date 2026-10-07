import { describe, expect, it } from "vitest"
import { boxArtSrc } from "../../../apps/web/src/lib/box-art"

describe("boxArtSrc", () => {
  it("should substitute the width and height placeholders", () => {
    expect(
      boxArtSrc(
        "https://static-cdn.jtvnw.net/ttv-boxart/27471_IGDB-{width}x{height}.jpg",
      ),
    ).toBe("https://static-cdn.jtvnw.net/ttv-boxart/27471_IGDB-40x54.jpg")
  })
})
