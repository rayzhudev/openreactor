# OpenReactor

OpenReactor is an agentic harness that allows software products to evolve on
their own.

The core idea is simple: the full product lifecycle can now be automated, not
just the code-writing step. Requests can enter a system, get judged, get turned
into real product work, move through branches and pull requests, deploy, and
feed their learnings back into the system again.

The main goal of OpenReactor is to become a system that anyone can implement so
their software products can evolve fully autonomously, without requiring a
human to manually steer every feature, fix, and deployment.

## The Engine

OpenReactor works by turning software development into a living loop instead of
a sequence of one-off tasks.

In that loop:

1. The website accepts a request and turns it into a structured GitHub issue.
2. An agentic reactor decides what that request actually means for the product.
3. The system can reject it, bank it for later, break it into smaller pieces,
   or implement it directly.
4. If it is worth doing, the system opens real branches and pull requests and
   carries the work forward.
5. When changes merge, the product redeploys and the new state becomes the next
   thing future agents build on.
6. The system preserves memory about product direction, constraints, and
   learnings so the loop gets smarter over time.

That is the OpenReactor engine: intake, judgment, implementation, verification,
deployment, and memory all connected into one continuous system.

## Why It Matters

Most current AI software workflows stop at "generate some code."

OpenReactor is aimed at something much larger: a world where software products
can continuously improve themselves end to end. Not just writing code, but
deciding what to build, deciding what not to build, handling ambiguity,
preparing human handoffs when needed, opening PRs, recovering from conflicts,
deploying, and learning from the result.

If that loop becomes reliable, software development changes shape. The
bottleneck is no longer "can the model write code?" but "can the product
govern itself well enough to evolve safely and coherently over time?"

## Governance

The system is intentionally not a literal ticket fulfiller.

- Issues are product feedback, not binding specs.
- Low-sensitivity experiments can move quickly.
- High-sensitivity surfaces such as the homepage, brand voice, and engine
  behavior need stronger evidence or maintainer steering.
- Good ideas do not need to be implemented immediately; they can be stored in
  the feedback bank until more support accumulates.
- Privileged internal/admin behavior remains a hard boundary.

This is the mechanism that lets the product stay fluid without letting one
random request rewrite its identity.

## Current State

What is live now:

- public intake page
- structured request form
- GitHub issue creation
- public queue view backed by GitHub issues
- GitHub-backed support counts and signed-in support actions when website OAuth is configured
- local reactor loop for autonomous issue handling

The website/backend and the reactor are separate:

- Cloudflare Pages + Functions serve the public site and request API
- the machine-local reactor handles autonomous triage, planning, implementation,
  PR repair, and retry logic

Today, the public website deploys continuously through Cloudflare Pages, while
the local reactor handles the autonomous issue loop on this machine.

## Running The Reactor

The repository includes the machine-local orchestration loop under
[`reactor/`](/home/ray/projects/openreactor/reactor).

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

The reactor currently:

- claims work with `or:running`
- pauses repeated startup failures with `or:paused`
- banks worthwhile-but-not-yet-actionable feedback with `feedback-bank`
- applies `sensitivity:*` and `evidence:*` labels during triage
- creates a dedicated git worktree per issue
- persists per-issue run files under `.openreactor/`
- retries the same issue until it reaches a real terminal state

The operational details below exist to support the engine. They are not the
point of the project. The point is to make the product lifecycle itself
autonomous.

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

## Local Development

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

See [ROADMAP.md](/home/ray/projects/openreactor/ROADMAP.md),
[MEMORY.md](/home/ray/projects/openreactor/MEMORY.md), and
[PRODUCT_SPEC.md](/home/ray/projects/openreactor/PRODUCT_SPEC.md) for the
current product direction and engine rules. Deployment details live in
[DEPLOYMENT.md](/home/ray/projects/openreactor/DEPLOYMENT.md). GitHub App
settings are documented in [GITHUB_APP_SETUP.md](/home/ray/projects/openreactor/GITHUB_APP_SETUP.md).
