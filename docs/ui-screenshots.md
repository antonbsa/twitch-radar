# UI screenshots

Before seeing a UI change (checking your own work, or attaching a screenshot to a PR), use the `tests/web/e2e` tier instead of the dev server: it seeds an authenticated session for you, so there's no manual login and no `localhost`/`127.0.0.1` session-cookie mismatch. The throwaway spec and its output images live under gitignored paths (`tests/web/e2e/scratch/`, `test-results/`), so nothing here can end up committed, and eslint ignores the scratch directory, so a leftover spec is harmless.

1. Write the spec at `tests/web/e2e/scratch/<name>.spec.ts` (`scratch/` is gitignored but still matches the tier's `tests/web/e2e/**/*.spec.ts` include glob). Use the `authenticatedSession` fixture from `tests/web/e2e/setup/fixtures.ts`, navigate to the screen you changed and call `screenshot(page, "<shot>")` from `tests/web/e2e/setup/screenshot.ts`. The helper writes `test-results/pr-screenshots/<shot>.png` (with a `-before`/`-after` suffix under `--before`); never set the path or the suffix yourself.
2. Capture it:
   ```bash
   npm run pr:screenshot -- tests/web/e2e/scratch/<name>.spec.ts            # this worktree only
   npm run pr:screenshot -- tests/web/e2e/scratch/<name>.spec.ts --before   # origin/main and this worktree
   ```
   The spec runs through the tier's own `globalSetup` (`wrangler dev` + `vite dev`). Use `--before` only when there is something comparable on `main`; a brand-new screen has no "before". With it, the script then runs the same spec from a detached `origin/main` worktree (`npm install` included), removes that worktree when done even if the spec fails, and copies its images back. The two runs go one after the other because the e2e tier uses fixed ports. The command prints the paths of the generated images.
3. Upload them with `npm run pr:image -- <paths>` and put the Markdown it prints in the PR description (Impact, or Summary when it frames the problem better); use `gh pr edit --body-file` when the PR already exists.

## Layout in the PR description

Images go in a Markdown table, following recent PRs:

- Header row: what each column shows. `Before | After` for a comparison, or the screen/state names (`List | Channel details`, `Mobile | Desktop`) when there is no "before".
- Extra rows only when there is another dimension (e.g. Desktop and Mobile); then add a first column with the row label, with an empty header cell.
- A single image needs no table.

```md
|            | Before         | After         |
| ---------- | -------------- | ------------- |
| **Mobile** | ![a-before](…) | ![a-after](…) |
```

## One-time setup: `pr-assets` branch

`npm run pr:image` needs an orphan `pr-assets` branch on origin. Create it once, from any checkout (it builds an empty commit without touching the working tree):

```bash
git push origin "$(git commit-tree "$(git hash-object -t tree /dev/null)" -m "chore: init pr-assets")":refs/heads/pr-assets
```

Don't upload screenshots containing real tokens, emails or non-test user data: the repo is public.
