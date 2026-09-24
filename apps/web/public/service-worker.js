// Push-only service worker: no fetch handler for app requests, no caching
// (ADR 0026). Payload shape is { titleKey, bodyKey?, params, lang, url,
// broadcasterUserId, categoryId, broadcasterLogin?, image? } (ADR 0044,
// ADR 0050): the API only ever sends semantic keys, never translated text,
// so this handler resolves them against the same locale catalog the React
// app uses (public/locales/<lang>.json) before showing the notification.
// `bodyKey` is optional — a title-only payload must render with no body,
// not a generic fallback (issue #38).
//
// interpolate()/DEFAULT_LANGUAGE/loadCatalog below intentionally duplicate
// (not import) the small equivalents in src/lib/i18n.ts — this script is a
// classic worker with no build step and cannot import from src/ (ADR 0026),
// mirroring ADR 0028's "mirror small wire-facing logic across a boundary
// that can't share a build-time import" reasoning.

const DEFAULT_LANGUAGE = "en"
const FALLBACK_TITLE = "Twitch Radar"
const FALLBACK_BODY = "A channel you follow has an update."
const FALLBACK_SNOOZE_ACTION_TITLE = "Remind me in 15m"
const FALLBACK_WATCH_ACTION_TITLE = "Watch"

// WebKit on iOS is known to drop `event.notification.data` by the time
// notificationclick fires for a web-pushed notification on an installed PWA
// (the object showNotification() was given doesn't reliably survive to the
// click event). Cache Storage is unaffected by that bug, so the push handler
// also stashes the target url there as a fallback notificationclick can read
// when `data` comes back empty. Single slot is enough: pushes aren't
// concurrent enough in this app to need one per notification.
const NOTIFICATION_URL_CACHE = "notification-url-v1"
const NOTIFICATION_URL_CACHE_KEY = "/__pending-notification-url"

async function rememberNotificationUrl(url) {
  const cache = await caches.open(NOTIFICATION_URL_CACHE)
  await cache.put(NOTIFICATION_URL_CACHE_KEY, new Response(url))
}

async function recallNotificationUrl() {
  const cache = await caches.open(NOTIFICATION_URL_CACHE)
  const res = await cache.match(NOTIFICATION_URL_CACHE_KEY)
  return res ? res.text() : null
}

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
      // ADR 0048: pass broadcaster/category through notification.data so
      // notificationclick can snooze without a separate lookup.
      const broadcasterUserId = payload?.broadcasterUserId || null
      const categoryId = payload?.categoryId || null
      const broadcasterLogin = payload?.broadcasterLogin || null
      let title = FALLBACK_TITLE
      // null renders a title-only notification; FALLBACK_BODY is reserved
      // for a payload that had no titleKey at all (malformed/non-JSON push).
      let body = payload?.titleKey ? null : FALLBACK_BODY
      let snoozeActionTitle = FALLBACK_SNOOZE_ACTION_TITLE
      let watchActionTitle = FALLBACK_WATCH_ACTION_TITLE

      if (payload?.titleKey) {
        const catalog = await loadCatalog(payload.lang || DEFAULT_LANGUAGE)
        const resolvedTitle =
          catalog && interpolate(catalog[payload.titleKey], payload.params)
        title = resolvedTitle || title
        if (payload.bodyKey) {
          const resolvedBody =
            catalog && interpolate(catalog[payload.bodyKey], payload.params)
          body = resolvedBody || FALLBACK_BODY
        }
        snoozeActionTitle =
          (catalog && catalog["notification.snooze_action"]) ||
          snoozeActionTitle
        watchActionTitle =
          (catalog && catalog["notification.watch_action"]) || watchActionTitle
      }

      const canSnooze = Boolean(broadcasterUserId && categoryId)

      // Watch ahead of snooze (max 2 actions in practice on Chrome); when
      // snoozing isn't possible, Watch is the only action shown.
      const actions = []
      if (broadcasterLogin) {
        actions.push({ action: "watch", title: watchActionTitle })
      }
      if (canSnooze) {
        actions.push({ action: "snooze", title: snoozeActionTitle })
      }

      await rememberNotificationUrl(url)
      await self.registration.showNotification(title, {
        ...(body ? { body } : {}),
        icon: "/icon.svg",
        badge: "/icon.svg",
        ...(payload?.image ? { image: payload.image } : {}),
        // Collapses repeat notifications from the same broadcaster into one
        // (issue #38 item 3) instead of stacking a notification per event.
        ...(broadcasterUserId
          ? { tag: broadcasterUserId, renotify: true }
          : {}),
        data: { url, broadcasterUserId, categoryId, broadcasterLogin },
        actions,
      })
    })(),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  // Watch action (issue #38 item 7): straight to the channel's Twitch page,
  // bypassing the app entirely — distinct from clicking the notification
  // body, which keeps going to the in-app deep link below.
  if (event.action === "watch") {
    const { broadcasterLogin } = event.notification.data ?? {}
    if (broadcasterLogin) {
      event.waitUntil(
        self.clients.openWindow(`https://twitch.tv/${broadcasterLogin}`),
      )
    }
    return
  }

  // Snooze action (ADR 0048): fire-and-forget the reminder request instead
  // of focusing/opening a window — the user dismissed this one on purpose.
  if (event.action === "snooze") {
    const { broadcasterUserId, categoryId } = event.notification.data ?? {}
    if (broadcasterUserId && categoryId) {
      event.waitUntil(
        fetch("/api/notifications/snooze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            broadcaster_user_id: broadcasterUserId,
            category_id: categoryId,
          }),
        }).catch(() => {
          // Best-effort: if this fails, no reminder fires. There is no
          // notification left to retry from.
        }),
      )
    }
    return
  }

  event.waitUntil(
    (async () => {
      const url =
        event.notification.data?.url || (await recallNotificationUrl()) || "/"
      const targetUrl = new URL(url, self.location.origin).href
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      })

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
        const focused = await appClient.focus()
        return "navigate" in focused ? focused.navigate(targetUrl) : focused
      }
      return self.clients.openWindow(targetUrl)
    })(),
  )
})
