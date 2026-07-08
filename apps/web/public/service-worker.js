// Push-only service worker: no fetch handler, no caching (ADR 0026).
// Payload shape comes from the architecture spec: { title, body, url }.

self.addEventListener("push", (event) => {
  let payload = null
  try {
    payload = event.data?.json() ?? null
  } catch {
    // Non-JSON payloads fall through to the generic notification below.
  }

  const title = payload?.title || "Twitch Radar"
  const body = payload?.body || "A channel you follow has an update."
  const url = payload?.url || "/"

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url },
    }),
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
