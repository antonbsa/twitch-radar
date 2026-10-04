# UI screenshots

Before seeing a UI change (checking your own work, or attaching a screenshot to a PR), use the `tests/web/e2e` tier instead of the dev server: it seeds an authenticated session for you, so there's no manual login and no `localhost`/`127.0.0.1` session-cookie mismatch. Both the throwaway spec and its output image live under gitignored paths (`tests/web/e2e/scratch/`, `test-results/`), so nothing here can end up committed, and eslint ignores the scratch directory, so a leftover spec is harmless.

1. Write the spec at `tests/web/e2e/scratch/<name>.spec.ts` (the `scratch/` directory is gitignored but still matches the tier's `tests/web/e2e/**/*.spec.ts` include glob, so it runs normally). Use the `authenticatedSession` fixture from `tests/web/e2e/setup/fixtures.ts`: it seeds a live session via the test seam and opens a real browser page already authenticated. Navigate to the screen you changed and call `page.screenshot({ path: "test-results/pr-screenshots/<name>.png" })`.
2. Run just that spec through the tier's own config so it gets the tier's `globalSetup` (`wrangler dev` + `vite dev`):
   ```bash
   npx vitest run --config vitest.e2e.config.ts tests/web/e2e/scratch/<name>.spec.ts
   ```
3. Attach the resulting image to the PR description. Leaving the spec file under `scratch/` is fine.

## Before

For a before/after comparison, capture the "before" from `origin/main` in a detached worktree. `git worktree add ... main` fails with `'main' is already used by worktree`, and symlinking `node_modules` from the feature worktree is unreliable.

1. Create the worktree: `git worktree add --detach .agents/worktrees/before-<slug> origin/main`.
2. Run `npm install` at its root.
3. Copy the scratch spec into the same path there (`tests/web/e2e/scratch/<name>.spec.ts`), keeping a different output file name (e.g. `<name>-before.png`) if you want both images side by side.
4. Run the same e2e command from that worktree's root.
5. Remove it: `git worktree remove --force .agents/worktrees/before-<slug>`.

Run the two sides one after the other, never concurrently: the e2e tier uses fixed ports.
