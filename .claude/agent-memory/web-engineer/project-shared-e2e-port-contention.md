---
name: project-shared-e2e-port-contention
description: tests/web/e2e (and tests/api) hardcode ports 5173/8787/8788 — concurrent agent sessions in different worktrees on this host collide on them
metadata:
  type: project
---

`vitest.e2e.config.ts`'s global setup always spawns `wrangler dev` on port 8787 and `vite dev` on port 5173 (fixed, not per-worktree — see CLAUDE.md's Env Vars section on why `PUBLIC_URL`/proxy target are hardcoded). When multiple agent sessions are working in parallel out of different `.agents/worktrees/*` checkouts (or one worktree plus the main repo checkout) and any of them runs `npm run test:web` / `test:e2e` at the same time, they race for the same OS-level ports and one fails with `Address already in use` (vite) or a `workerd` `kj::Exception ... bind ... Address already in use` (wrangler).

**Why:** confirmed directly in a session on 2026-09-01 — three concurrent worktrees (main repo checkout, `category-suggestion-and-push-prompt`, `channel-detail-modal-with-snapshot`) were all mid-e2e-run at once, each holding 5173/8787 in turn. Retrying the failing command doesn't help since the other session's server is a moving target, not a stuck process.

**How to apply:** when `test:web`/`test:e2e` fails specifically with a bind/EADDRINUSE-style error (not a real test assertion failure), check `lsof -i :5173 -i :8787` and `ps -ef | grep wrangler` before assuming your own code broke something. If the offending process's cwd is a *different* worktree or the main repo checkout, it belongs to another concurrent agent session — do not kill it (that sabotages someone else's run). Only kill orphaned processes whose path matches *your own* worktree left over from your own earlier failed attempts (safe to clean up). Otherwise, poll briefly (a few `sleep`-and-check rounds, capped) until the ports are free, then retry once immediately — the window can be short since other sessions cycle through setup/teardown quickly. Don't loop indefinitely; if still blocked after a couple of tries, report the contention honestly rather than declaring the feature untested.
