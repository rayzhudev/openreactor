# OpenReactor Autonomous Test Run

The OpenReactor Autonomous Test Run is a deliberate, automated canary run for
OpenReactor itself.

Its purpose is to exercise the real issue-to-PR loop end to end using a tiny,
safe, reviewable OpenReactor-core change.

## What it checks

- issue creation and trusted maintainer steering
- issue claiming and triage
- agent dispatch
- branch and PR creation
- merge readiness
- documentation propagation back into the repo

## How to trigger it

```bash
bun run openreactor:self-test
```

That command should open or reuse a maintainer-steered `openreactor-core`
self-test issue with the title:

- `[Self-Test] OpenReactor Autonomous Test Run`

## How agents should treat it

- keep the change minimal
- prefer OpenReactor docs or this file over product churn
- use the normal OpenReactor workflow, not a shortcut path
- record what part of the workflow was exercised and what was learned

## Log

- 2026-03-13: Technique renamed from `Factory Pass` to `Autonomous Test Run`
  so the name reflects that it is both a test run and an automated OpenReactor
  workflow exercise.
