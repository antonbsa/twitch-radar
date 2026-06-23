# 0012 - Use NPM Workspaces For App Packages

## Status

Accepted

## Context

The repository has separate deployment targets under `apps/api` and `apps/web`. The web app is expected to become a React application, which will bring frontend-specific dependencies and scripts that should not be owned by the API package.

NPM workspaces support managing multiple local packages from a single top-level package.

## Decision

Use npm workspaces with package roots:

- `apps/api`
- `apps/web`

Each app owns its own `package.json`, dependencies, and package-local scripts.

The root `package.json` remains the orchestration entrypoint for common commands.

## Consequences

- The root package must be `private`.
- Root scripts should delegate to workspace scripts.
- Frontend React dependencies can later be added to `apps/web` without coupling them to the Worker API.
- API runtime dependencies belong to `apps/api`.
