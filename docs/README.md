# Documentation

Start with the [product overview](product.md) for what Twitch Radar does, then pick the page that matches what you're doing.

| Doc | Read it when |
| --- | --- |
| [product.md](product.md) | You want to know what the app is for, how a notification is decided, and what it deliberately doesn't do. |
| [architecture/](architecture/overview.md) | You want to understand how the system works end to end and why: start with the overview, then the subsystem pages (auth, follow sync, monitoring, matching, delivery, jobs, web client, observability, testing, deploy, engineering process). |
| [development.md](development.md) | You're setting up locally, testing push (including from a phone), or working with env vars, ports and worktrees. |
| [deployment.md](deployment.md) | You're standing up or redeploying the Cloudflare environments, rotating secrets, or deploying manually. |
| [api-contract.md](api-contract.md) | You need the HTTP surface: routes, shapes and errors. |
| [decisions/](decisions/README.md) | You want the reasoning behind a specific decision. One ADR per decision; some are superseded by later ones. |
| [notes/](notes/README.md) | You want a research conclusion that isn't a decision, including options considered and not taken. |

Agent and contributor conventions live in the [`AGENTS.md`](../AGENTS.md) files, not here.
