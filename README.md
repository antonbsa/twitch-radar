# Twitch Category Alerts

Mobile-first PWA for Twitch viewers who want push notifications when followed streamers start streaming selected categories.

## Documentation

- [MVP architecture](specs/mvp/00.%20architecture.md)
- [Architecture decisions](docs/decisions/README.md)
- [SDD implementation plan](specs/mvp/01.%20sdd-implementation-plan.md)
- [MVP implementation tasks](specs/mvp/tasks/t-000-global.md)
- [Project guidance](AGENTS.md)

## Local Development

Install dependencies:

```sh
npm install
```

Apply local D1 migrations:

```sh
npm run db:setup
```

Generate a migration after editing the Drizzle schema:

```sh
npm run db:generate -- --name create_sessions
npm run db:check
```

Start the API Worker:

```sh
npm run dev
```

Check API health:

```txt
http://localhost:8787/api/health
```

If port `8787` is occupied:

```sh
npx wrangler dev --config apps/api/wrangler.toml --port 8797
```

Serve the frontend root:

```sh
npm run dev:web
```

Copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` when secrets are needed for later tasks.

## Validation

Run:

```sh
npm run typecheck
npm test
```
