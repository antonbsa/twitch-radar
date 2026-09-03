// Push-only service worker: no fetch handler for app requests, no caching
// (ADR 0026). Payload shape is { titleKey, bodyKey, params, lang, url }
// (ADR 0044): the API only ever sends semantic keys, never translated text,
// so this handler resolves them against the same locale catalog the React
// app uses (public/locales/<lang>.json) before showing the notification.
//
// interpolate()/DEFAULT_LANGUAGE/loadCatalog below intentionally duplicate
// (not import) the small equivalents in src/lib/i18n.ts — this script is a
// classic worker with no build step and cannot import from src/ (ADR 0026),
// mirroring ADR 0028's "mirror small wire-facing logic across a boundary
// that can't share a build-time import" reasoning.

const DEFAULT_LANGUAGE = "en"
const FALLBACK_TITLE = "Twitch Radar"
const FALLBACK_BODY = "A channel you follow has an update."

function interpolate(template, params) {
  if (!template) return null
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    params && key in params ? String(params[key]) : match,
  )
}

async function loadCatalog(lang) {
  try {
    const res = await fetch(`/locales/${lang}.json`)
    if (!res.ok) throw new Error(`Failed to load locale ${lang}`)
    return await res.json()
  } catch {
    if (lang !== DEFAULT_LANGUAGE) return loadCatalog(DEFAULT_LANGUAGE)
    return null
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = null
      try {
        payload = event.data?.json() ?? null
      } catch {
        // Non-JSON payloads fall through to the generic notification below.
      }

      const url = payload?.url || "/"
      let title = FALLBACK_TITLE
      let body = FALLBACK_BODY

      if (payload?.titleKey && payload?.bodyKey) {
        const catalog = await loadCatalog(payload.lang || DEFAULT_LANGUAGE)
        const resolvedTitle =
          catalog && interpolate(catalog[payload.titleKey], payload.params)
        const resolvedBody =
          catalog && interpolate(catalog[payload.bodyKey], payload.params)
        title = resolvedTitle || title
        body = resolvedBody || body
      }

      await self.registration.showNotification(title, {
        body,
        icon: "/icon.svg",
        badge: "/icon.svg",
        data: { url },
      })
    })(),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  const targetUrl = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  ).href

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Prefer focusing an already-open app window (navigating it if it is
        // on a different route) over spawning a new one.
        for (const client of windowClients) {
          if (client.url === targetUrl && "focus" in client) {
            return client.focus()
          }
        }
        const appClient = windowClients.find(
          (client) =>
            new URL(client.url).origin === self.location.origin &&
            "focus" in client,
        )
        if (appClient) {
          return appClient
            .focus()
            .then((focused) =>
              "navigate" in focused ? focused.navigate(targetUrl) : focused,
            )
        }
        return self.clients.openWindow(targetUrl)
      }),
  )
})
