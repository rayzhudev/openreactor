# Deployment

## What this deploys

The MVP is a Cloudflare Pages project with Pages Functions that:

- serves a static frontend,
- accepts feature request submissions,
- creates GitHub issues,
- and reads back the live request queue from GitHub.

## Required configuration

OpenReactor needs these environment values:

- `GITHUB_OWNER`: GitHub owner or organization
- `GITHUB_REPO`: target repository
- `GITHUB_LABELS`: optional comma-separated labels to apply when those labels already exist
- `GITHUB_APP_ID`: GitHub App ID
- `GITHUB_APP_CLIENT_ID`: optional GitHub App client ID
- `GITHUB_APP_INSTALLATION_ID`: optional installation ID
- `GITHUB_APP_PRIVATE_KEY`: GitHub App private key PEM

Legacy fallback:

- `GITHUB_TOKEN`: optional token used to create issues directly via API

## Local development

1. Install packages:

```bash
bun install
```

2. Copy local vars:

```bash
cp .dev.vars.example .dev.vars
```

3. Fill in `.dev.vars`.

4. Start the app:

```bash
bun run dev
```

## Cloudflare deployment

Use Wrangler to set runtime values before deploying:

```bash
npx wrangler secret put GITHUB_OWNER
npx wrangler secret put GITHUB_REPO
npx wrangler secret put GITHUB_LABELS
npx wrangler secret put GITHUB_APP_ID
npx wrangler secret put GITHUB_APP_CLIENT_ID
npx wrangler secret put GITHUB_APP_INSTALLATION_ID
npx wrangler secret put GITHUB_APP_PRIVATE_KEY
```

Optional legacy fallback:

```bash
npx wrangler secret put GITHUB_TOKEN
```

Then deploy:

```bash
bun run deploy
```

If the Pages project does not exist yet, create it first:

```bash
bunx wrangler pages project create openreactor
```

Then attach the production custom domain in Cloudflare Pages:

```bash
bunx wrangler pages deployment list --project-name openreactor
```

## GitHub App requirements

OpenReactor should use a GitHub App installed on the target repository. The app
needs:

- `Metadata`: read-only
- `Issues`: read and write
- `Contents`: read and write
- `Pull requests`: read and write
- `Commit statuses`: read and write

See [GITHUB_APP_SETUP.md](/home/ray/projects/openreactor/GITHUB_APP_SETUP.md)
for the exact setup.

Legacy PAT support still exists, but only as a fallback.

GitHub docs:

- https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-an-installation

Cloudflare docs:

- https://developers.cloudflare.com/workers/configuration/secrets/

## First production pass

Once deployed, verify:

1. `/api/health` returns `ok: true`
2. the homepage loads
3. a form submission creates a GitHub issue directly through the GitHub App, or falls back to a prefilled GitHub issue URL
4. the new issue appears in the public queue

If labels do not appear on new issues, create those labels in GitHub first or
leave `GITHUB_LABELS` empty.
