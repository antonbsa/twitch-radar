# 0022 - Use shadcn/ui For Component Primitives

## Status

Accepted

## Context

The frontend needs accessible, unstyled-but-themeable primitives (buttons, bottom sheets, inputs, badges, avatars) rather than a full opinionated component library, so the Twitch-sidebar visual style from the UI reference can be applied directly on top.

## Decision

Use shadcn/ui (Radix-based, `radix-nova` style) as the source for base components. Components are copied into `apps/web/src/components/ui` via the `shadcn` CLI rather than installed as an opaque npm dependency, so they can be edited freely.

Scaffold-time component set: `Button`, `Sheet`, `Input`, `Badge`, `Avatar`. The `Sheet` component backs the per-channel and global category preference bottom sheets described in the UI reference.

## Consequences

- `apps/web/components.json` configures the `@` import alias (`@/*` → `./src/*`) and CSS variable theming; this alias must stay in sync between `vite.config.ts` and `tsconfig.json`/`tsconfig.app.json` or `shadcn add` writes files to the wrong path.
- Component source lives in the repo and is expected to be modified directly (no upgrade-via-package-bump path).
- Additional components (e.g. for category search results) are added on demand with `npx shadcn@latest add <component>` as later tasks need them.
