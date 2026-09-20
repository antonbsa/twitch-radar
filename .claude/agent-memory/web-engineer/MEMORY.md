# Memory Index

- [Shared e2e port contention](project-shared-e2e-port-contention.md) — tests/web/e2e hardcodes ports 5173/8787; concurrent worktree sessions collide, don't kill other sessions' servers
- [No Playwright matchers in e2e tier](project-e2e-tier-no-playwright-matchers.md) — tests/web/e2e uses vitest's expect, not @playwright/test's; toHaveAttribute/toBeAttached don't exist
- [git -C over cd+git in worktrees](feedback-git-dash-c-in-worktrees.md) — cd+git got denied by sandbox once, git -C worked; try -C first if compound git command is denied
