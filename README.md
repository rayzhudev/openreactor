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

OpenReactor is now wired to prefer GitHub App authentication for direct issue
creation. If GitHub App credentials are not present yet, the form falls back to
a prefilled GitHub issue creation flow so the intake loop still works.

Everything else in the broader product spec is deferred until this loop is live.

## Local reactor

The repository now includes a machine-local orchestration loop under
[`reactor/`](/home/ray/projects/openreactor/reactor). It is the first
slice of the autonomous backend:

- polls GitHub for open issues
- claims work with the `or:running` label
- moves issues to `or:paused` after repeated startup failures so broken tool/config states do not loop forever
- creates a dedicated git worktree per issue
- spawns a fresh Codex agent for that issue
- persists per-issue run files under `.openreactor/`
- keeps retrying the same issue until the agent returns `accepted` or `rejected`
- verifies that accepted runs have a pushed branch, an open PR, and no failed reported checks

Run it on this machine with the same GitHub environment variables already used
for the Pages site:

```bash
bun run reactor
```

One-pass dry operation:

```bash
bun run reactor:once
```

Safe polling verification without claiming issues:

```bash
bun run reactor:dry-run
```

Useful environment variables:

- `OPENREACTOR_POLL_INTERVAL_MS`
- `OPENREACTOR_MAX_ITERATION_RUNTIME_MS`
- `OPENREACTOR_MAX_CONCURRENT_ISSUES`
- `OPENREACTOR_MAX_ITERATIONS_PER_ISSUE`
- `OPENREACTOR_MAX_START_FAILURES_PER_ISSUE`
- `OPENREACTOR_PAUSED_LABEL`
- `OPENREACTOR_TRIAGE_MODEL`
- `OPENREACTOR_TRIAGE_REASONING_EFFORT`
- `OPENREACTOR_TRIAGE_SERVICE_TIER`
- `OPENREACTOR_AGENT_MODEL`
- `OPENREACTOR_AGENT_REASONING_EFFORT`
- `OPENREACTOR_AGENT_SERVICE_TIER`
- `OPENREACTOR_CLAUDE_UI_MODEL`
- `OPENREACTOR_CLAUDE_UI_EFFORT`
- `OPENREACTOR_CLAUDE_UI_BIN`

Leave the `*_SERVICE_TIER` variables unset unless you have a known-good tier for the installed Codex CLI and account. The default reactor behavior is to omit `service_tier` entirely.

For OpenReactor's current repo size, a small-team default of
`OPENREACTOR_MAX_CONCURRENT_ISSUES=3` is a better balance than either
single-threaded execution or large fan-out. The codebase is still small enough
that many accepted issues touch the same frontend and runtime files, so a small
parallelism cap reduces conflict churn without making the reactor feel stalled.

Helper tooling for issue agents:

```bash
bun run reactor:tool --help
bun run reactor:tool coauthor-trailer --username octocat
bun run agent-browser:install
```

Issue-agent runs also receive isolated `agent-browser` session settings so UI
changes can be checked against a local URL without colliding across issues.

Production intake smoke test:

```bash
bun run smoke:pages -- --base-url https://openreactor.net --cleanup
```

`reactor:tool ensure-pr` pushes branches over HTTPS with the short-lived GitHub
App installation token already injected into the run. That avoids using the
server's SSH identity for remote publication. It also enables PR auto-merge by
default; agents should pass `--no-auto-merge` when a PR must wait for manual
review or human intervention. Accepted issues are also re-queued automatically
if their open PR becomes unmergeable due to merge conflicts, and the reactor
also sweeps all open `openreactor/issue-*` PRs each tick so conflicted follow-up
branches get re-claimed even when the issue itself is already closed.

Each new issue now goes through a cheap lightweight triage agent first. Only
issues that triage dispatches are handed off to an implementation tool. UI-heavy
work can be routed to a Claude UI agent, while everything else goes to the
standard Codex issue agent.

Run files under `.openreactor/runs/issue-*` include:

- `plan.json` for structured decision state
- `tasks.md` for the working checklist
- `progress.md` with a `Codebase Patterns` section for durable learnings

## Reactor service

The repo includes a user-level systemd unit template at
[`ops/openreactor-reactor.service`](/home/ray/projects/openreactor/ops/openreactor-reactor.service)
and an env template at
[`ops/reactor.env.example`](/home/ray/projects/openreactor/ops/reactor.env.example).

The installed service runs directly from this checkout, so code updates are
picked up after a restart:

```bash
systemctl --user restart openreactor-reactor.service
```

Useful commands:

```bash
systemctl --user status --no-pager openreactor-reactor.service
journalctl --user -u openreactor-reactor.service -n 100 --no-pager
```

## Local development

1. Install dependencies:

```bash
bun install
```

2. Create a local secrets file:

```bash
cp .dev.vars.example .dev.vars
```

3. Fill in your GitHub repo target and auth values in `.dev.vars`.

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
[DEPLOYMENT.md](/home/ray/projects/openreactor/DEPLOYMENT.md). GitHub App
settings are documented in [GITHUB_APP_SETUP.md](/home/ray/projects/openreactor/GITHUB_APP_SETUP.md).
