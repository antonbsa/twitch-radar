<!--
Title: follow the Conventional Commits prefixes from CLAUDE.md's "Commit Message Rules"
(feat:, fix:, docs:, test:, chore:, refactor:), e.g. "feat: add stale-follow re-sync cron"
-->

## Summary

<!-- What changed and why - objective, only what's actually relevant to review.
     Prefer bullet points; a short lead-in sentence plus bullets works too.
     Avoid storytelling/narrative - only justified for genuinely dense changes. -->

## Impact

<!-- The outcome: what this improves, fixes, or changes for users or the system,
     backed by proof (command output, screenshots, benchmark results).
     For bug fixes: show the failure before and the pass after.
     Skip/mark N/A for changes with no external effect (e.g. pure refactor, docs). -->

## References

<!-- Issue: Closes #123 / Refs #123
     Spec/ADR (one per line, if more than one):
     - link to a spec or ADR this implements or changes
     - link to another, if applicable
     Delete lines/section that don't apply. -->


## Checklist

<!-- Check what applies. If a box can't be checked, explain why in a sub-bullet
     (e.g. "manual only - no automated coverage for push permission prompts"). -->

- [ ] Added/updated automated tests (`tests/api` and/or `tests/web`) covering this change (if not docs-only, config-only, etc.)
- [ ] Includes a D1 migration, `wrangler.jsonc`/cron change, or a new/changed env var - called out in Summary
- [ ] Updates specs/ADRs if this changes accepted behavior or a prior decision

## How to test

<!-- Steps for a reviewer to manually reproduce/verify this, if applicable. -->

## Additional context (optional)
