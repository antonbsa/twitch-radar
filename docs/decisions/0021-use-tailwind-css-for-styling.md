# 0021 - Use Tailwind CSS For Styling

## Status

Accepted

## Context

The UI layout reference (`specs/mvp/02. ui-layout.md`) specifies a mobile-first, compact, Twitch-sidebar-style visual language across three tabs plus bottom-sheet panels. Hand-written CSS (the POC's `styles.css` approach) does not scale to this many small, densely styled components.

## Decision

Use Tailwind CSS v4 via the `@tailwindcss/vite` plugin. Styling is CSS-first: `src/index.css` imports Tailwind and defines theme tokens as CSS custom properties, with no separate `tailwind.config.js`.

## Consequences

- No POC-era hand-written stylesheet is carried into the MVP frontend.
- Design tokens (colors, radius) live as CSS variables in `src/index.css`, shared with shadcn/ui components (ADR 0022).
- Utility classes are used directly in JSX rather than introducing a separate CSS-Modules or styled-components layer.
