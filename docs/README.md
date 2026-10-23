# Documentation

Start with the [product overview](product.md) for what Twitch Radar does, then pick the page that matches what you're doing.

## Operate

| Doc | Read it when |
| --- | --- |
| [operations/incident.md](operations/incident.md) | Something is misbehaving in production or preview and you need to stop it now: pause queues, roll back, purge a backlog. |
| [operations/environment-setup.md](operations/environment-setup.md) | You're standing up a Cloudflare environment: resources, non-secret vars, the Twitch console, CI credentials. |
| [operations/secrets.md](operations/secrets.md) | You're setting, rotating or storing a secret, or wiring error alerting. |
| [operations/deploying.md](operations/deploying.md) | You're deploying manually, applying a migration, or cutting a release. |
| [operations/backup-and-restore.md](operations/backup-and-restore.md) | You need to restore the database, check the off-site backup, or rehearse a restore. |

## Understand

| Doc | Read it when |
| --- | --- |
| [product.md](product.md) | You want to know what the app is for, how a notification is decided, and what it deliberately doesn't do. |
| [architecture/](architecture/overview.md) | You want to understand how the system works end to end and why: start with the overview, then the subsystem pages (auth, follow sync, monitoring, matching, delivery, jobs, web client, observability, testing, deploy, engineering process). |

## Do

| Doc | Read it when |
| --- | --- |
| [development.md](development.md) | You're setting up locally, testing push (including from a phone), or working with env vars, ports and worktrees. |

## Look Up

| Doc | Read it when |
| --- | --- |
| [reference/api-contract.md](reference/api-contract.md) | You need the HTTP surface: routes, shapes and errors. |
| [GLOSSARY.md](../GLOSSARY.md) | You need the meaning of a domain term: Channel State, Snapshot, Event, Stale Event, State Change. |

## Record

| Doc | Read it when |
| --- | --- |
| [decisions/](decisions/README.md) | You want the reasoning behind a specific decision. One ADR per decision; some are superseded by later ones. |
| [notes/](notes/README.md) | You want a research conclusion that isn't a decision, including options considered and not taken. |

Agent and contributor conventions live in the [`AGENTS.md`](../AGENTS.md) files, not here.
