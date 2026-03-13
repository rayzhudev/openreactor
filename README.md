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

## The OpenReactor Workflow

OpenReactor works by turning software development into a living loop instead of
a sequence of one-off tasks.

In that loop:

1. The website accepts a request and turns it into a structured GitHub issue.
2. An agentic reactor decides what that request actually means for the product.
3. The system can reject it, bank it for later, break it into smaller pieces,
   or implement it directly.
4. Discussion on the GitHub issue can refine the request over time, and
   OpenReactor can pick that updated discussion back up instead of freezing the
   original judgment forever.
5. If it is worth doing, the system opens real branches and pull requests and
   carries the work forward.
6. When changes merge, the product redeploys and the new state becomes the next
   thing future agents build on.
7. The system preserves memory about product direction, constraints, and
   learnings so the loop gets smarter over time.
8. The system can run a small end-to-end canary issue called the Factory Pass
   to prove the loop still works in practice.

That is the OpenReactor workflow: intake, judgment, implementation, verification,
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
- High-sensitivity surfaces such as the homepage, brand voice, and OpenReactor
  behavior need stronger evidence or maintainer steering.
- `/playground/` is the intentionally loose product surface. Weird, prankish,
  chaotic, or obviously unserious requests should usually be routed there
  instead of being rejected just for being disruptive to the core site.
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
- signed-in GitHub attribution for website submissions, while anonymous submission still remains allowed
- trusted maintainer steering and authenticated submitter identity propagation
  through decomposed child issues
- local reactor loop for autonomous issue handling

The website/backend and the reactor are separate:

- Cloudflare Pages + Functions serve the public site and request API
- the machine-local reactor handles autonomous triage, planning, implementation,
  PR repair, and retry logic

Today, the public website deploys continuously through Cloudflare Pages, while
the local reactor handles the autonomous issue loop on this machine. A local
watchdog process can now supervise that reactor, detect stalled issues and
startup failure loops, and attempt limited self-healing before escalating to a
maintainer.

OpenReactor can also expose a read-only live metadata feed from this machine so
the website can visualize what the local system is doing without giving the
public site direct control over the runtime. That feed is limited to metadata
such as active agents, stalled work, and service health. The visual rendering
stays in the website.

UI quality is now also treated as a system concern, not just an agent taste
problem. The standing visual rules live in
[UI_SYSTEM.md](/home/ray/projects/openreactor/UI_SYSTEM.md), and accepted UI
work is expected to prove real browser verification instead of relying on diff
inspection alone.

## OpenReactor vs Product

The clearest split in this repo is conceptual, not folder-level:

- `reactor/` and `ops/` are the OpenReactor core
- `public/` and `functions/` are the product currently being built by OpenReactor

That means the repo does **not** need a big folder rename right now. The naming
is already serviceable once the governance boundary is explicit.

What it did need was a clearer policy split:

- [CONSTITUTION.md](/home/ray/projects/openreactor/CONSTITUTION.md) defines the
  boundary
- [PRODUCT_CONSTITUTION.md](/home/ray/projects/openreactor/PRODUCT_CONSTITUTION.md)
  governs the public-facing product
- [OPENREACTOR_WORKFLOW.md](/home/ray/projects/openreactor/OPENREACTOR_WORKFLOW.md)
  describes the maintainer-controlled OpenReactor process

OpenReactor issues should carry the `openreactor-core` label so they are not
confused with normal website/product feedback.

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

The watchdog is a separate supervisor for local runtime health:

```bash
bun run watchdog
bun run watchdog:once
```

The local read-only status feed can be served with:

```bash
bun run openreactor-status
```

If the public website needs to reach that local feed from Cloudflare Pages, the
repo also includes a dedicated tunnel wrapper:

```bash
bun run openreactor-status:tunnel
```

The reactor currently:

- claims work with `or:running`
- pauses repeated startup failures with `or:paused`
- banks worthwhile-but-not-yet-actionable feedback with `feedback-bank`
- applies `sensitivity:*` and `evidence:*` labels during triage
- creates a dedicated git worktree per issue from the latest `origin/main`
- persists per-issue run files under `.openreactor/`
- retries the same issue until it reaches a real terminal state
- reconsiders banked, paused, or previously rejected issues when later
  discussion materially refines the task or explicitly calls the bot back in,
  even if the issue had only been parked in GitHub state and never reached a
  local run
- records and surfaces execution metadata such as provider, model, reasoning
  effort, and duration in GitHub-visible status comments and PR bodies where
  OpenReactor has that information directly

The watchdog currently:

- watches for stalled `or:running` issues based on run heartbeats
- treats very high iteration counts as a workflow red flag and escalates them
  into `openreactor-core` repair work instead of assuming more retries will
  solve the problem
- watches for `or:paused` issues that have stayed paused too long
- restarts the reactor service when a running issue appears stalled
- clears retryable paused issues back into the queue after a delay
- stops the reactor during GitHub App rate-limit loops and waits out a cooldown
- opens concrete `openreactor-core` repair issues when it detects an
  OpenReactor bug blocking issue flow
- fast-forwards the local checkout to `origin/main` and restarts the local
  services after a merged OpenReactor repair PR
- flags non-recoverable failures for maintainer attention instead of retrying forever

## Factory Pass

The Factory Pass is OpenReactor's deliberate end-to-end canary run.

It exists to push one small, safe issue through the real workflow so the
system can expose regressions in claiming, triage, implementation, PR creation,
and merge readiness before those failures become hard to notice.

Open or reuse the current Factory Pass issue with:

```bash
bun run openreactor:self-test
```

That command only creates or reuses the issue. The actual work still flows
through the normal reactor like any other maintainer-steered OpenReactor task.

The status service currently:

- reads the reactor's live run snapshot from `.openreactor/live/`
- reads watchdog pause and escalation state from `.openreactor/watchdog/`
- exposes only metadata about active agents, stalled issues, maintainer handoffs, and local service health
- is intended to be consumed by the website through `/api/openreactor-status`
- should be exposed from this machine behind a token when the public site needs to reach it
- can be published through a dedicated Cloudflare Tunnel hostname without exposing a raw public port

The operational details below exist to support OpenReactor. They are not the
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
- `OPENREACTOR_STATUS_BIND_HOST`
- `OPENREACTOR_STATUS_PORT`
- `OPENREACTOR_STATUS_TOKEN`

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
review or human intervention. If a feature is blocked on a maintainer-only step
such as OAuth setup or secret provisioning, the reactor now leaves the PR open,
disables auto-merge, and applies `maintainer-action-required` instead of
merging a documented partial. Accepted issues are also re-queued automatically
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

## Watchdog service

The repo also includes a user-level watchdog unit template at
[`ops/openreactor-watchdog.service`](/home/ray/projects/openreactor/ops/openreactor-watchdog.service).

It uses the same env file and runs locally on this machine so it can supervise
and restart the reactor service:

```bash
systemctl --user restart openreactor-watchdog.service
systemctl --user status --no-pager openreactor-watchdog.service
journalctl --user -u openreactor-watchdog.service -n 100 --no-pager
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

Validation:

```bash
bun run check
```

## Deploy

Set the same secrets in Cloudflare, then deploy:

```bash
bun run deploy
```

See [ROADMAP.md](/home/ray/projects/openreactor/ROADMAP.md),
[MEMORY.md](/home/ray/projects/openreactor/MEMORY.md), and
[PRODUCT_SPEC.md](/home/ray/projects/openreactor/PRODUCT_SPEC.md) for the
current product direction and OpenReactor workflow rules. Deployment details live in
[DEPLOYMENT.md](/home/ray/projects/openreactor/DEPLOYMENT.md). GitHub App
settings are documented in [GITHUB_APP_SETUP.md](/home/ray/projects/openreactor/GITHUB_APP_SETUP.md).
