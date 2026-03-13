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

## Run Log

### 2026-03-13 - Issue #223

- Scope: minimal documentation-only canary run
- Change: add the initial tracked canary log and record the first completed pass
- Workflow exercised: issue claim, context hydration, plan update, tracked repo
  edit, validation run, branch publication, PR creation, and issue follow-up
- Learning: a deliberately tiny documentation change is enough to verify the
  full OpenReactor path without introducing product risk

### 2026-03-13 - Issue #225

- Scope: minimal documentation-only autonomous test run
- Change: promote the canary log to the requested
  `OPENREACTOR_AUTONOMOUS_TEST_RUN.md` name and append this run
- Workflow exercised: issue claim, maintainer-steered OpenReactor triage,
  acceptance-criteria planning, tracked repo edit, validation run, branch
  publication, PR creation, and issue follow-up
- Learning: the repo can preserve prior canary history while still adapting the
  audit trail format requested by a new OpenReactor self-test
