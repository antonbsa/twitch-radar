# Memory Index

- [KV min TTL gotcha](gotcha-kv-min-ttl.md) — Cloudflare KV rejects expirationTtl < 60s; fails silently as a runtime 500, not a typecheck error
- [E2E_USER_ID KV leak gotcha](gotcha-e2e-user-id-kv-leak.md) — new user-keyed KV state needs cleanup wired into both `_tests.ts` reset paths or it leaks across tests sharing the fixed E2E_USER_ID
- [Fresh worktree needs npm install](gotcha-fresh-worktree-needs-npm-install.md) — a new git worktree has no node_modules; typecheck fails with a misleading "Cannot find type definition" error until `npm install` runs at the worktree root
