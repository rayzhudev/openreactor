# OpenReactor

OpenReactor is a self-building software platform. The immediate goal is narrower:
launch a public website where users can submit product requests, and turn those
requests into structured GitHub issues that agents can pick up.

## Current MVP

The current MVP is intentionally small:

- public intake page
- structured request form
- GitHub issue creation
- public queue view backed by GitHub issues

Everything else in the broader product spec is deferred until this loop is live.

## Local development

1. Install dependencies:

```bash
bun install
```

2. Create a local secrets file:

```bash
cp .dev.vars.example .dev.vars
```

3. Fill in your GitHub repo target and token in `.dev.vars`.

4. Start the Worker:

```bash
bun run dev
```

## Deploy

Set the same secrets in Cloudflare, then deploy:

```bash
bun run deploy
```

See [ROADMAP.md](/home/ray/projects/openreactor/ROADMAP.md) and
[MEMORY.md](/home/ray/projects/openreactor/MEMORY.md) for current product
constraints and implementation decisions. Deployment details live in
[DEPLOYMENT.md](/home/ray/projects/openreactor/DEPLOYMENT.md).
