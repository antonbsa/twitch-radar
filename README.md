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

If port `8787` is occupied, edit `--port` in `apps/api/package.json`.

Fill in `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` in `apps/api/.dev.vars.development` before using any Twitch OAuth flows. All other variables have working local defaults.

## Validation

Run:

```sh
npm run typecheck
npm test
```
