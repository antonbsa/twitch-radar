import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { Plugin } from "vite"

export type IconEnvironment = "development" | "preview" | "production"

const SOURCE_PATH = fileURLToPath(new URL("../icons/icon.svg", import.meta.url))
const PRODUCTION_DOT = "#9146ff"
const ENVIRONMENT_COLORS = {
  development: "#f59e0b",
  preview: "#3b82f6",
}

// `</>` is drawn as paths, not <text>: glyphs would differ between browsers,
// sharp in CI and phones depending on installed fonts.
const pill = (
  color: string,
) => `  <rect x="312" y="372" width="148" height="84" rx="42" fill="${color}"/>
  <g fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M356 398 340 414 356 430"/>
    <path d="M416 398 432 414 416 430"/>
    <path d="M393 394 379 434"/>
  </g>
`

// Android masks the maskable icon to a circle of 80% of its width (radius 204): the pill shrinks and moves in so its corner stays inside.
const maskablePill = (color: string) =>
  `  <g transform="translate(386 386) scale(.75) translate(-460 -456)">\n${pill(color)}  </g>\n`

export const ICON_FILES = {
  small: "icon-small.svg",
  large: "icon-large.svg",
  maskable: "icon-maskable.svg",
  appleTouch: "apple-touch-icon.png",
}

/** Vite serves in development, builds with `--mode preview` for preview; anything else (including an unknown mode) is production. */
export function resolveIconEnvironment(
  command: "serve" | "build",
  mode: string,
): IconEnvironment {
  if (command === "serve") return "development"
  return mode === "preview" ? "preview" : "production"
}

/** Small (favicon): dot color only. Large (manifest, apple-touch-icon, notification icon) and maskable (full-bleed, for Android launchers): dot plus a `</>` pill outside production. The notification badge is the static, monochrome `badge.svg`. */
export function buildIconSvgs(environment: IconEnvironment): {
  small: string
  large: string
  maskable: string
} {
  const source = readFileSync(SOURCE_PATH, "utf-8")
  const maskableSource = source.replace(' rx="96"', "")
  if (environment === "production") {
    return { small: source, large: source, maskable: maskableSource }
  }

  const color = ENVIRONMENT_COLORS[environment]
  const small = source.replace(PRODUCTION_DOT, color)
  const large = small.replace("</svg>", `${pill(color)}</svg>`)
  const maskable = maskableSource
    .replace(PRODUCTION_DOT, color)
    .replace("</svg>", `${maskablePill(color)}</svg>`)
  return { small, large, maskable }
}

async function rasterizeAppleTouch(svg: string): Promise<Buffer> {
  const { default: sharp } = await import("sharp")
  return sharp(Buffer.from(svg)).resize(180, 180).png().toBuffer()
}

/** Serves (dev) and emits (build) the per-environment app icons for the active Vite mode. */
export function appIconPlugin(): Plugin {
  let environment: IconEnvironment = "production"

  return {
    name: "app-icon",
    configResolved(config) {
      environment = resolveIconEnvironment(config.command, config.mode)
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split("?")[0]
        const { small, large, maskable } = buildIconSvgs(environment)
        const svgByPath: Record<string, string> = {
          [`/${ICON_FILES.small}`]: small,
          [`/${ICON_FILES.large}`]: large,
          [`/${ICON_FILES.maskable}`]: maskable,
        }
        if (path && path in svgByPath) {
          res.setHeader("Content-Type", "image/svg+xml")
          res.setHeader("Cache-Control", "no-cache")
          res.end(svgByPath[path])
        } else if (path === `/${ICON_FILES.appleTouch}`) {
          res.setHeader("Content-Type", "image/png")
          res.setHeader("Cache-Control", "no-cache")
          res.end(await rasterizeAppleTouch(large))
        } else {
          next()
        }
      })
    },
    async generateBundle() {
      const { small, large, maskable } = buildIconSvgs(environment)
      this.emitFile({
        type: "asset",
        fileName: ICON_FILES.small,
        source: small,
      })
      this.emitFile({
        type: "asset",
        fileName: ICON_FILES.large,
        source: large,
      })
      this.emitFile({
        type: "asset",
        fileName: ICON_FILES.maskable,
        source: maskable,
      })
      this.emitFile({
        type: "asset",
        fileName: ICON_FILES.appleTouch,
        source: await rasterizeAppleTouch(large),
      })
    },
  }
}
