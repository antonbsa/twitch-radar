import { describe, expect, it } from "vitest"
import type { Plugin } from "vite"
import {
  appIconPlugin,
  buildIconSvgs,
  ICON_FILES,
  resolveIconEnvironment,
} from "../../../apps/web/vite-plugins/app-icon-plugin"

type Emitted = { fileName: string; source: string | Uint8Array }

async function emittedFor(command: "serve" | "build", mode: string) {
  const plugin = appIconPlugin() as Required<
    Pick<Plugin, "configResolved" | "generateBundle">
  >
  // @ts-expect-error only the fields the plugin reads
  plugin.configResolved({ command, mode })
  const emitted: Emitted[] = []
  // @ts-expect-error minimal plugin context
  await plugin.generateBundle.call({
    emitFile: (f: Emitted) => emitted.push(f),
  })
  return Object.fromEntries(emitted.map((f) => [f.fileName, f.source]))
}

describe("resolveIconEnvironment", () => {
  it("should map serve to development and mode preview to preview", () => {
    expect(resolveIconEnvironment("serve", "development")).toBe("development")
    expect(resolveIconEnvironment("build", "preview")).toBe("preview")
  })

  it("should fall back to production for production, empty or unknown modes", () => {
    expect(resolveIconEnvironment("build", "production")).toBe("production")
    expect(resolveIconEnvironment("build", "")).toBe("production")
    expect(resolveIconEnvironment("build", "staging")).toBe("production")
  })
})

describe("buildIconSvgs", () => {
  it("should keep the green dot and no pill in production", () => {
    const { small, large } = buildIconSvgs("production")
    expect(small).toContain("#22c55e")
    expect(large).toBe(small)
    expect(large).not.toContain('<rect x="312"')
  })

  it.each([
    ["development", "#f59e0b"],
    ["preview", "#3b82f6"],
  ] as const)(
    "should color the %s dot and add the pill only to the large icon",
    (env, color) => {
      const { small, large } = buildIconSvgs(env)
      expect(small).toContain(color)
      expect(small).not.toContain("#22c55e")
      expect(small).not.toContain('<rect x="312"')
      expect(large).toContain(
        `<rect x="312" y="372" width="148" height="84" rx="42" fill="${color}"/>`,
      )
      expect(large).not.toContain("<text")
    },
  )
})

describe("appIconPlugin bundle output", () => {
  it.each([
    ["build", "preview", "#3b82f6"],
    ["build", "production", "#22c55e"],
    ["build", "nonsense", "#22c55e"],
  ] as const)(
    "should emit the icons for %s --mode %s",
    async (command, mode, color) => {
      const files = await emittedFor(command, mode)
      expect(Object.keys(files).sort()).toEqual(
        Object.values(ICON_FILES).sort(),
      )
      expect(String(files[ICON_FILES.small])).toContain(color)
      const png = files[ICON_FILES.appleTouch] as Buffer
      expect(png.subarray(1, 4).toString()).toBe("PNG")
      // IHDR width/height
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180])
    },
  )
})
