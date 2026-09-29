# Changelog

Qué cambió para quienes usan Twitch Radar, una sección por versión publicada. Escrito en lenguaje simple para el panel "Novedades" de la app — sin números de PR, prefijos de commit ni cambios internos; la lista técnica completa vive en cada GitHub Release, generada a partir de las labels de los PRs (ver [ADR 0050](docs/decisions/0050-changelog-as-source-of-truth-for-release-notes.md)). Una sección `## Unreleased`, cuando existe, es ignorada por el panel y por el parser de build.

## v0.2.0 — 2026-09-28

Twitch Radar ahora está disponible en español y portugués de Brasil, junto con una página de Alertas rediseñada y nuevas formas de reaccionar a las notificaciones de canales en vivo.

### New

- La app y las notificaciones push ahora están disponibles en español y portugués de Brasil, además de inglés.
- Tocar un canal seguido abre una vista con su última instantánea, título, categoría y número de espectadores, con un enlace directo para verlo en Twitch.
- La lista de canales ahora se puede buscar, filtrar y ordenar.
- La página de Alertas fue rediseñada, agrupando las preferencias de notificación por canal para facilitar su gestión.
- Cuando un canal seguido está en vivo, puedes activar las notificaciones para su categoría actual con un toque, y se te sugiere activar el push si aún no está activo.
- Las notificaciones ahora ofrecen la opción "Recordarme en 15m" en lugar de solo poder descartarse.

### Improved

- Las notificaciones son más confiables de configurar, recuperándose automáticamente de problemas que antes podían impedir que se activaran.

## v0.1.1 — 2026-08-30

### Improved

- Sincronizar tus canales seguidos ahora es más rápido.
- Un breve intervalo entre sincronizaciones evita que toques repetidos inicien la misma sincronización dos veces.

### Fixed

- Cancelar la pantalla de inicio de sesión de Twitch ahora te lleva de vuelta a la página de inicio de sesión con un mensaje claro en lugar de un error.
- Cuando tu conexión con Twitch necesita renovarse, la app te avisa en cuanto se carga la página.

## v0.1.0 — 2026-07-31

El primer lanzamiento de Twitch Radar.

### New

- Inicia sesión con tu cuenta de Twitch, y tus canales seguidos se sincronizan automáticamente.
- Elige las categorías de juegos que te interesan, para todos los canales o para canales específicos.
- Recibe una notificación push cuando un canal que sigues entra en vivo en una de esas categorías.
- Instala Twitch Radar en tu teléfono o computadora como una app.
