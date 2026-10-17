---
name: screenshot
description: Use to attach before/after screenshots to a PR (npm run pr:screenshot, npm run pr:image).
---

# Capturing UI Screenshots

Before attaching a screenshot to a PR, use the `tests/web/e2e` tier: it seeds an authenticated session and renders the same way on both branches, so `--before` and `--after` are comparable. To just look at a change while working, drive the dev server with the Playwright MCP instead (root `AGENTS.md`, "Worktrees and `.agents/`"). The throwaway spec and its output images live under gitignored paths (`tests/web/e2e/scratch/`, `test-results/`), so nothing here can end up committed, and eslint ignores the scratch directory, so a leftover spec is harmless.

1. Write the spec at `tests/web/e2e/scratch/<name>.spec.ts` (`scratch/` is gitignored but still matches the tier's `tests/web/e2e/**/*.spec.ts` include glob). Use the `authenticatedSession` fixture from `tests/web/e2e/setup/fixtures.ts`, navigate to the screen you changed and call `screenshot(page, "<shot>")` from `tests/web/e2e/setup/screenshot.ts`. The helper writes `test-results/pr-screenshots/<shot>.png` (with a `-before`/`-after` suffix under `--before`); never set the path or the suffix yourself.
   - Symptom: toasts, sheets and dialogs appear mid-transition (half-faded, sliding, stacked at the wrong offset). Why it slips: `expectVisible` passes as soon as the element is in the DOM and visible, long before its enter/exit animation ends, and nothing fails. Fix: `await page.waitForTimeout(1000)` after the last action and right before each `screenshot(...)`, then check the image for a settled state.
2. Capture it:
   ```bash
   npm run pr:screenshot -- tests/web/e2e/scratch/<name>.spec.ts            # this worktree only
   npm run pr:screenshot -- tests/web/e2e/scratch/<name>.spec.ts --before   # origin/main and this worktree
   ```
   The spec runs through the tier's own `globalSetup` (`wrangler dev` + `vite dev`). Use `--before` only when there is something comparable on `main`; a brand-new screen has no "before". With it, the script then runs the same spec from a detached `origin/main` worktree (`npm install` included), removes that worktree when done even if the spec fails, and copies its images back. The two runs go one after the other because the e2e tier uses fixed ports. The command prints the paths of the generated images.
3. Upload them with `npm run pr:image -- <paths>` and put the Markdown it prints in the PR description (Impact, or Summary when it frames the problem better); use `gh pr edit --body-file` when the PR already exists.

## Layout in the PR description

Images go in a Markdown table with two columns, `Before | After`, and one row holding only the images: no row-label column (`**Mobile**`, `**Desktop**`) and no extra rows. A single image (no "before" to compare) needs no table.

```md
| Before         | After         |
| -------------- | ------------- |
| ![a-before](…) | ![a-after](…) |
```

## Where images live

`npm run pr:image` commits to `assets/<branch>/` on `main` of the `<repo>-ci-reports` repo (set up in [docs/deployment.md](../../../docs/deployment.md#ci-test-reports-repo); [ADR 0060](../../../docs/decisions/0060-publish-failed-ci-test-reports-to-a-pages-repo.md)) and needs push access to it through `gh`. The links point at `main`, not a commit, so re-uploading a name replaces it in earlier PR descriptions; use a new name to keep both.

Don't upload screenshots containing real tokens, emails or non-test user data: the repo is public.
