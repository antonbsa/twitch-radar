# 0026 - Manual Service Worker And Manifest Without vite-plugin-pwa

## Status

Accepted

## Context

T-005 needs a registered service worker (for Web Push `push`/`notificationclick` handling) and a valid web app manifest (for installability, which iOS requires before push is available at all). The common Vite integration is `vite-plugin-pwa`, which brings Workbox, precaching, an auto-update lifecycle, and manifest generation.

The MVP has no offline requirement: every view is server-data-driven and useless without the network, and the service worker exists solely so the browser can wake it for push events. The POC (commit `e8417e9`, see [ADR 0010](0010-keep-poc-separate-from-mvp-architecture.md)) already proved the push/notification-click mechanics with a hand-written service worker of ~35 lines.

## Decision

- Write the service worker by hand as a static asset: `apps/web/public/service-worker.js`, registered from the React entry point (`src/main.tsx`) at startup. Vite copies `public/` to the build output root, so the file is served from `/service-worker.js` with root scope in both dev and production.
- The service worker implements only `push` and `notificationclick`. There is **no `fetch` handler and no caching** — the app remains network-only. Offline support, precaching, or an update-prompt lifecycle would be the trigger to revisit `vite-plugin-pwa`.
- The manifest is likewise a static asset, `apps/web/public/manifest.webmanifest`, linked from `index.html`.
- The service worker stays plain JavaScript (not TypeScript compiled through a second build entry), keeping the Vite config untouched; it is still linted.
- Icons are the existing `icon.svg` declared with `sizes: "any"`. Chromium accepts SVG manifest icons for installability; proper PNG icons (192/512 manifest icons plus a 180px `apple-touch-icon`, which iOS requires as PNG for a crisp home-screen icon) are an asset-generation follow-up tracked in the T-005 task doc for the iOS manual validation pass.

## Consequences

- No new dependencies, no Workbox runtime, and no generated service worker to debug; the entire push surface of the client is one readable file.
- Because there is no `fetch` handler, the service worker never interferes with Vite dev serving, HMR, or API requests — the e2e tier runs against the real registered worker without cache-invalidation concerns.
- Service worker updates rely on the browser's byte-diff check on navigation (plus `registration.update()` on registration); with no precache manifest there is no stale-asset risk, since assets are always fetched from the network.
- If offline support or richer PWA UX is ever wanted, adopting `vite-plugin-pwa` later is additive: the manifest moves into plugin config and the handlers move into an `injectManifest` worker.
