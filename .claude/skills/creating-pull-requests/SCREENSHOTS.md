# Screenshot recipe

The `tests/web/e2e` tier already has everything needed to get an authenticated, real-app screenshot without a manual login flow. Both the throwaway spec and its output image live under gitignored paths (`tests/web/e2e/scratch/`, `test-results/`), so there's no cleanup step - nothing here can end up committed.

1. Write the spec at `tests/web/e2e/scratch/<name>.spec.ts` (the `scratch/` directory is gitignored but still matches the tier's `tests/web/e2e/**/*.spec.ts` include glob, so it runs normally). Use the `authenticatedSession` fixture from `tests/web/e2e/setup/fixtures.ts` - it seeds a live session via the test seam and opens a real browser page already authenticated. Navigate to the screen you changed and call `page.screenshot({ path: "test-results/pr-screenshots/<name>.png" })`.
2. Run just that spec through the tier's own config so it gets the tier's `globalSetup` (`wrangler dev` + `vite dev`):
   ```bash
   npx vitest run --config vitest.e2e.config.ts tests/web/e2e/scratch/<name>.spec.ts
   ```
3. Attach the resulting image to the PR description. Leaving the spec file under `scratch/` is fine - it's gitignored and won't surface in `git status` or any future diff.
