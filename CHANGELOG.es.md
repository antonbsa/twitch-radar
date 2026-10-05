# Changelog

Qué cambió para quienes usan Twitch Radar, una sección por versión publicada. Escrito en lenguaje simple para el panel "Novedades" de la app — sin números de PR, prefijos de commit ni cambios internos; la lista técnica completa vive en cada GitHub Release, generada a partir de las labels de los PRs (ver [ADR 0050](docs/decisions/0050-changelog-as-source-of-truth-for-release-notes.md)). Una sección `## Unreleased`, cuando existe, es ignorada por el panel y por el parser de build.

## v0.3.0 — 2026-10-04

Las notificaciones son mucho más útiles: foto del canal, botón Ver y un texto que realmente dice qué cambió.

### New

- Las notificaciones ahora tienen un botón "Ver" que abre el canal en Twitch y pueden mostrar una vista previa de la transmisión.
- Las notificaciones, la lista de canales y los detalles del canal ahora muestran la foto de perfil del streamer.
- El panel "Novedades" muestra qué cambió en cada versión y se puede abrir desde el número de versión en la app.

### Improved

- El texto de las notificaciones ahora aporta información nueva, como cuánto tiempo lleva el canal en vivo, a qué estaba jugando antes o el título de la transmisión, en lugar de repetir el título de la notificación.
- Varias alertas seguidas del mismo canal ahora se reemplazan entre sí en lugar de acumularse.
- Tus canales seguidos ahora se sincronizan automáticamente al abrir la app o al volver a ella después de un rato.
- El filtro de categorías en Canales muestra cuántos canales están en vivo en cada categoría.
- Buscar una categoría o añadir un canal ahora abre una pantalla completa que no queda tapada por el teclado, con tus categorías guardadas primero.
- La app ahora confirma cuando se guarda una preferencia o cuando un cambio falla.

### Fixed

- Las repeticiones, playlists y watch parties ya no envían alertas como si el canal acabara de entrar en vivo.
- La barra de pestañas inferior y los paneles ya no quedan debajo del indicador de inicio del iPhone, y las listas ya no se desplazan por detrás de la barra de pestañas.

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
