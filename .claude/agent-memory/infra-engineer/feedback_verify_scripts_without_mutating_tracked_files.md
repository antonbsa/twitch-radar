---
name: verify-scripts-without-mutating-tracked-files
description: To prove a check script fails on bad input, run it against a scratchpad mirror, not by editing tracked files and restoring with git checkout
metadata:
  type: feedback
---

When verifying that a repo check script (e.g. `infra/scripts/check-i18n.mjs`) fails on drift, don't write bad data into tracked files and restore with `git checkout --`: that command was permission-denied (2026-10-04, issue #86).

**Why:** mutating tracked files plus a git restore reads as a destructive/state-changing action and is blocked by the permission settings.

**How to apply:** copy the script and its inputs into the scratchpad with the same relative layout (scripts resolve REPO_ROOT from `import.meta.url`), corrupt the copies, run the copy. No need to add a path-override flag to the script just for testing.
