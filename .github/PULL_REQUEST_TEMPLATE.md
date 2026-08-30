<!--
Title: follow the Conventional Commits prefixes from CLAUDE.md's "Commit Message Rules"
(feat:, fix:, docs:, test:, chore:, refactor:), e.g. "feat: add stale-follow re-sync cron"
-->

## Summary

<!-- The problem/context and the changes made to address it - objective, only what's relevant to review.
     Bullet points are encouraged for listing the changes; lead with a sentence or two of prose when
     framing the problem/context, or when a bullet would otherwise need its own justification to make sense.
     Design-decision rationale that needs its own record belongs in an ADR (linked in References), not here. -->

## Impact

<!-- The specific effect this PR causes: a capability that now exists, a bug that's now fixed, a behavior
     that's now different - for users or the system. Be precise about the actual effect, not a before/after
     template to fill in. Attach proof (command output, screenshots, benchmark numbers) only to substantiate
     that specific claim - not as a standalone test/lint recap.
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
- [ ] Verified lint, typecheck, and relevant test suites pass locally

## How to test

<!-- Steps for a reviewer to manually reproduce/verify this, if applicable. -->

## Additional context (optional)
