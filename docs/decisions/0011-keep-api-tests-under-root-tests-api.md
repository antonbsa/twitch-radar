# 0011 - Keep API Tests Under Root Tests Api

## Status

Accepted

## Context

The repository contains separate app roots and needs test paths that can scale beyond one app package while keeping test utilities easy to share.

## Decision

Keep API tests under `tests/api`.

Keep API test utilities under `tests/api/utils`.

## Consequences

- API TypeScript configuration must include `../../tests/api/**/*.ts`.
- Test imports use explicit paths back to `apps/api/src`.
- Future web tests can use sibling test roots such as `tests/web`.
