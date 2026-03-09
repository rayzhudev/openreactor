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
- `GITHUB_TOKEN`: optional token used to create issues directly via API
- `GITHUB_LABELS`: optional comma-separated labels to apply when those labels already exist

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
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put GITHUB_LABELS
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

## GitHub token requirements

Use a token that can read repository issues and create new issues in the target
repository. For a fine-grained personal access token, repository `Issues` write
permission is the key requirement. Public issue listing may work without a token,
and the site can fall back to a prefilled GitHub issue creation URL without one.

GitHub docs:

- https://docs.github.com/en/rest/issues/issues#create-an-issue
- https://docs.github.com/en/rest/overview/permissions-required-for-fine-grained-personal-access-tokens

Cloudflare docs:

- https://developers.cloudflare.com/workers/configuration/secrets/

## First production pass

Once deployed, verify:

1. `/api/health` returns `ok: true`
2. the homepage loads
3. a form submission creates a GitHub issue
4. the new issue appears in the public queue

If labels do not appear on new issues, create those labels in GitHub first or
leave `GITHUB_LABELS` empty.
