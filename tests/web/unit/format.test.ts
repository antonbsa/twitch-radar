import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  formatLiveDuration,
  formatViewerCount,
} from "../../../apps/web/src/lib/format"

describe("formatViewerCount", () => {
  it("should return the raw count under 1,000", () => {
    expect(formatViewerCount(0)).toBe("0")
    expect(formatViewerCount(999)).toBe("999")
  })

  it("should format thousands with a K suffix, trimming a trailing .0", () => {
    expect(formatViewerCount(1_000)).toBe("1K")
    expect(formatViewerCount(1_200)).toBe("1.2K")
    expect(formatViewerCount(42_000)).toBe("42K")
    expect(formatViewerCount(999_900)).toBe("999.9K")
  })

  it("should format millions with an M suffix, trimming a trailing .0", () => {
    expect(formatViewerCount(1_000_000)).toBe("1M")
    expect(formatViewerCount(1_200_000)).toBe("1.2M")
    expect(formatViewerCount(3_450_000)).toBe("3.5M")
  })
})

describe("formatLiveDuration", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-06-01T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("should format under an hour as minutes only", () => {
    expect(formatLiveDuration("2024-06-01T11:45:00Z")).toBe("15m")
  })

  it("should format an hour or more as `Xh Ym`", () => {
    expect(formatLiveDuration("2024-06-01T10:37:00Z")).toBe("1h 23m")
  })

  it("should floor sub-minute durations to 0m", () => {
    expect(formatLiveDuration("2024-06-01T11:59:59.500Z")).toBe("0m")
  })

  it("should clamp a start time in the future to 0m", () => {
    expect(formatLiveDuration("2024-06-01T13:00:00Z")).toBe("0m")
  })
})
