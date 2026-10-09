---
name: adding-a-shadcn-component
description: Use before running `npx shadcn add <component>` in apps/web; the CLI misconfigures paths, imports and dependencies here.
---

# Adding a shadcn Component

Procedure for `npx shadcn add <component>` in `apps/web`. The CLI (style `radix-nova`) misbehaves in this repo, so each step below works around a known failure. The change is done when `git status` shows only the new `components/ui/` file(s) and the files you meant to touch, and the new component renders no literal user-facing text.

## Before running

Confirm `@/*` is declared in both `tsconfig.json` and `tsconfig.app.json`. Without it the CLI silently writes to a literal `./@` directory instead of `src/components/ui/`.

## Running

The CLI blocks on an interactive "button.tsx already exists, overwrite?" prompt that `--yes` doesn't answer. Pipe the answer in so `button.tsx` keeps our edits:

```bash
printf 'n\n' | npx shadcn add <component>
```

## After running

1. Revert `package.json` and `package-lock.json` (`git checkout`, then `npm install`): the CLI adds a bogus `cn` npm dependency.
2. Change `import { cn } from "cn"` to `@/lib/utils` in every generated file.
3. Route literal text the component hardcodes (e.g. sr-only "Close") through `useLanguage().t()`, matching `ui/sheet.tsx` (key `common.close`), and add the key to all three locale files (ADR 0044).
