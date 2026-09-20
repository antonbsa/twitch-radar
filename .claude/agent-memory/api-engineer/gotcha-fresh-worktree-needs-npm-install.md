---
name: gotcha-fresh-worktree-needs-npm-install
description: A freshly created git worktree under .agents/worktrees/ has no node_modules — typecheck/lint/test fail with misleading errors until `npm install` is run at the worktree root
metadata:
  type: gotcha
---

A new `git worktree add` checkout does not inherit `node_modules` from the main checkout — it starts with none at all. Running `npm run typecheck` inside `apps/api` in a fresh worktree fails with `error TS2688: Cannot find type definition file for '@cloudflare/workers-types'`, which reads like a tsconfig/env problem but is actually just "dependencies were never installed here."

**Why:** npm workspaces hoist `node_modules` to the repo root; a worktree is a separate working directory with its own root, so nothing is symlinked or shared with the main checkout automatically.

**How to apply:** When starting work in a worktree (own or one handed off by an orchestrating task), check `ls node_modules` at the worktree root before trusting a typecheck/lint/test failure. If it's empty/missing, run `npm install` from the worktree root once — it pulls from the local npm cache so it's fast (~10s), not a fresh network install. Do this before diagnosing "type errors" that are actually missing-package errors.
