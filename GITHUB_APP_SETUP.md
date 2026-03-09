# GitHub App Setup

OpenReactor should use a GitHub App for direct issue creation and later
repository automation. This keeps repo automation separate from any personal
access token.

## Create the app

Create a new GitHub App in your account settings:

- App name: `OpenReactor`
- Homepage URL: `https://openreactor.net`
- Description: `Automation identity for OpenReactor issue intake and repository changes.`
- Callback URL: leave blank
- Setup URL: leave blank
- Webhook: disable for now

Install the app only on:

- `rayzhudev/openreactor`

## Repository permissions

Set these permissions:

- `Metadata`: Read-only
- `Issues`: Read and write
- `Contents`: Read and write
- `Pull requests`: Read and write
- `Commit statuses`: Read and write

Optional later:

- `Actions`: Read-only
- `Checks`: Read and write

Do not grant broader admin permissions unless OpenReactor explicitly needs to
manage repository settings.

## Secrets to capture

After you create and install the app, capture:

- App ID
- Client ID (optional but recommended)
- Private key PEM
- Installation ID (optional; OpenReactor can discover it from the repo)

## Cloudflare Pages secrets

Set these on the Pages project:

```bash
bunx wrangler pages secret put GITHUB_APP_ID --project-name openreactor
bunx wrangler pages secret put GITHUB_APP_CLIENT_ID --project-name openreactor
bunx wrangler pages secret put GITHUB_APP_INSTALLATION_ID --project-name openreactor
bunx wrangler pages secret put GITHUB_APP_PRIVATE_KEY --project-name openreactor
```

Existing secrets still used:

- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_LABELS`

Legacy fallback:

- `GITHUB_TOKEN`

## Runtime behavior

When GitHub App secrets are present, OpenReactor will:

1. sign a GitHub App JWT,
2. exchange it for an installation access token,
3. create issues through the GitHub REST API,
4. and use the same app identity later for branches, commits, and pull requests.

If GitHub App auth is missing or fails, the public intake flow falls back to a
prefilled GitHub issue creation URL.
