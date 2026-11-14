# Documentation

The [case study](case-study.md) covers Twitch Radar on one page; every page below goes deeper on one part of it. Pick the one that matches what you're doing.

## Understand

- **[Case study](case-study.md)**: the whole project on one page, in about ten minutes: the problem, the constraints, how it works and the key trade-offs.
- **[Product](product.md)**: what the app is for, how a notification is decided, and what it deliberately doesn't do.
- **[Architecture](architecture/overview.md)**: how the system works end to end and why. Start with the overview, then the subsystem pages (auth, follow sync, monitoring, matching, delivery, jobs, web client, observability, testing, deploy, engineering process).

## Do

- **[Run locally](guides/run-locally.md)**: setting up a machine, adding credentials, or running several worktrees. Starts with `npm run doctor`.
- **[Test push notifications](guides/test-push.md)**: a real push from your local setup without waiting for a broadcaster.
- **[Test on a phone](guides/test-on-phone.md)**: the installed app on a phone through a tunnel, and what to check when login or push fails there.

## Operate

- **[Stopping a misbehaving pipeline](operations/incident.md)**: something is wrong in production or preview and needs to stop now: pause queues, roll back, purge a backlog.
- **[Environment setup](operations/environment-setup.md)**: standing up a Cloudflare environment: resources, non-secret vars, the Twitch console, CI credentials.
- **[Secrets](operations/secrets.md)**: setting, rotating or storing a secret, or wiring error alerting.
- **[Deploying](operations/deploying.md)**: deploying manually, applying a migration, or cutting a release.
- **[Backup and restore](operations/backup-and-restore.md)**: restoring the database, checking the off-site backup, or rehearsing a restore.

## Look Up

- **[API contract](reference/api-contract.md)**: the HTTP surface: routes, shapes and errors.
- **[Glossary](../GLOSSARY.md)**: the domain terms: Channel State, Snapshot, Event, Stale Event, State Change.
- **[Project history](history.md)**: what the proof of concept, the MVP and milestone 0 set out to do and delivered.

## Record

- **[Architecture decisions](decisions/README.md)**: the reasoning behind each decision, one ADR per decision; some are superseded by later ones.
- **[Technical notes](notes/README.md)**: research conclusions that aren't decisions, including options considered and not taken.

Agent and contributor conventions live in the [`AGENTS.md`](../AGENTS.md) files, not here.
