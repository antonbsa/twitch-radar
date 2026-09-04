// Shared i18n primitives (ADR 0044). The catalog itself lives as plain JSON
// under public/locales/<lang>.json, fetched at runtime rather than imported
// at build time, so the exact same file (same URL) is reachable from both
// this React app and the service worker (apps/web/public/service-worker.js),
// which cannot import from src/ (ADR 0026: hand-written, no build step).
//
// The `{param}` interpolation helper here is intentionally tiny and
// duplicated (not imported) in service-worker.js — mirrors ADR 0028's
// reasoning for mirroring small wire-facing logic across a boundary that
// can't share a build-time import, rather than introducing a shared package.

export const SUPPORTED_LANGUAGES = ["en", "pt-BR", "es"] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]
export const DEFAULT_LANGUAGE: Language = "en"

export const LANGUAGE_STORAGE_KEY = "language"

export type Catalog = Record<string, string>

function isSupportedLanguage(value: string | null): value is Language {
  return (
    value !== null && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
  )
}

/**
 * Best-effort initial language before any authenticated user is known
 * (login page, first paint): a previously-chosen `localStorage` value wins
 * (same "client-side cache until the server value is known" idiom as
 * lib/push.ts's stored subscription id), then a prefix match against
 * `navigator.language`, then the default.
 */
export function resolveInitialLanguage(): Language {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (isSupportedLanguage(stored)) return stored

  const browserLanguage = navigator.language
  const prefixMatch = SUPPORTED_LANGUAGES.find(
    (lang) =>
      lang.toLowerCase() === browserLanguage.toLowerCase() ||
      lang.split("-")[0].toLowerCase() ===
        browserLanguage.split("-")[0].toLowerCase(),
  )
  return prefixMatch ?? DEFAULT_LANGUAGE
}

export function interpolate(
  template: string,
  params?: Record<string, string>,
): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? params[key] : match,
  )
}

const catalogCache = new Map<Language, Catalog>()

/**
 * Fetches and caches `/locales/<lang>.json`. Falls back to `en` on a
 * network/parse failure or an unrecognized language (never throws) so a
 * catalog problem degrades to English rather than a blank UI.
 */
export async function loadCatalog(language: Language): Promise<Catalog> {
  const cached = catalogCache.get(language)
  if (cached) return cached

  try {
    const res = await fetch(`/locales/${language}.json`)
    if (!res.ok) throw new Error(`Failed to load locale ${language}`)
    const catalog = (await res.json()) as Catalog
    catalogCache.set(language, catalog)
    return catalog
  } catch (err) {
    if (language !== DEFAULT_LANGUAGE) return loadCatalog(DEFAULT_LANGUAGE)
    if (import.meta.env.DEV) console.error("Failed to load locale catalog", err)
    return {}
  }
}
