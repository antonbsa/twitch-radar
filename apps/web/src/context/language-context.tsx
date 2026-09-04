import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { api } from "@/lib/api"
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  interpolate,
  loadCatalog,
  resolveInitialLanguage,
  type Catalog,
  type Language,
} from "@/lib/i18n"

interface LanguageContextValue {
  language: Language
  t: (key: string, params?: Record<string, string>) => string
  // User-initiated change: persists locally and, if authenticated, syncs to
  // the server (PATCH /api/me/language).
  setLanguage: (language: Language) => void
  // Reconciles from the authoritative server value (GET /api/me) without
  // re-triggering a PATCH back to the server.
  adoptLanguage: (language: Language) => void
}

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined,
)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE)
  const [catalog, setCatalog] = useState<Catalog>({})

  useEffect(() => {
    setLanguageState(resolveInitialLanguage())
  }, [])

  useEffect(() => {
    let cancelled = false
    loadCatalog(language).then((loaded) => {
      if (!cancelled) setCatalog(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [language])

  const adoptLanguage = useCallback((next: Language) => {
    setLanguageState((current) => (current === next ? current : next))
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
  }, [])

  const setLanguage = useCallback(
    (next: Language) => {
      adoptLanguage(next)
      // Fire-and-forget: a failed sync only means the server-side
      // preference (and thus notification language) lags the local UI
      // language until the next successful call — it must not block or
      // revert the optimistic local switch.
      api.patch("/me/language", { language: next }).catch(() => {})
    },
    [adoptLanguage],
  )

  const t = useCallback(
    (key: string, params?: Record<string, string>) => {
      const template = catalog[key]
      return template ? interpolate(template, params) : key
    },
    [catalog],
  )

  const value = useMemo<LanguageContextValue>(
    () => ({ language, t, setLanguage, adoptLanguage }),
    [language, t, setLanguage, adoptLanguage],
  )

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider")
  return ctx
}
