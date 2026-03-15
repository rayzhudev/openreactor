# OpenReactor Workflow

This file describes OpenReactor itself.

OpenReactor is the evolving process that receives feedback, triages it, routes
it, opens work, updates docs, and helps the product evolve. It is not best
thought of as a rigid constitution. It is a workflow and technique for making a
product continuously improve itself.

That includes treating GitHub issue discussion as live input. OpenReactor
should not freeze an issue forever based only on the original body if later
comments clarify, narrow, or otherwise improve the task.
That reconsideration should come from the live GitHub thread itself, not only
from whether some earlier local run happened to leave metadata on disk.
For issues that are already closed, OpenReactor should only revive them when
there is an explicit new call-in, such as a direct bot mention. A generic
maintainer comment on a closed issue is not enough by itself, because maintainers
also use comments to close duplicates or mark issues superseded.

## OpenReactor control rule

The OpenReactor core is maintainer-controlled.

Users may propose changes to OpenReactor, and those proposals may be useful,
but they are not normal product requests. They are OpenReactor proposals for
maintainer consideration.

## Workflow principles

- Preserve OpenReactor's ability to safely supervise autonomous work.
- Favor clear governance over convenience when the two conflict.
- Protect secret handling, auth boundaries, deployment policy, and privileged
  internal controls.
- Do not let random public feedback directly rewrite OpenReactor-governing
  policy.
- OpenReactor changes should usually come from maintainer steering or
  explicitly labeled OpenReactor issues.
- Trusted maintainer steering should come from real GitHub authorship or
  trusted OpenReactor-applied labels, not from free-text body fields.
- Readability and recoverability matter more than cleverness in core runtime
  code.
- OpenReactor should be allowed to evolve as a process, not frozen as a rigid
  one-time design.
- OpenReactor should supervise itself: stalled issues and repeated local
  runtime failures should be detected, classified, and either healed
  operationally or turned into concrete OpenReactor repair work.
- OpenReactor should periodically exercise its own workflow through an
  automated **Autonomous Test Run** so regressions in the issue-to-PR loop are
  caught through a real canary run, not only by waiting for production feature
  work to fail.
- Extremely high retry counts on one issue are themselves a failure signal.
  OpenReactor should treat that as a workflow smell, not as normal progress,
  and should route it into concrete OpenReactor repair work.
- OpenReactor should expose its own runtime metadata in a read-only way so the
  product can visualize the workflow without the product becoming the control
  plane for the workflow itself.
- OpenReactor should surface hard execution facts in public workflow artifacts
  where possible, such as provider, model, reasoning effort, and runtime
  duration, instead of relying only on narrative summaries.
- OpenReactor should refresh PR execution footers after the run finishes so
  the final PR body deterministically reflects the implementation agent that
  actually produced the result.
- When OpenReactor decomposes an oversized issue, it should create GitHub-native
  sub-issues for the child tasks and add issue dependencies only for true
  blocking relationships, so independent child tasks can still run in
  parallel.
- When a product issue is blocked on a maintainer-only prerequisite, OpenReactor
  should leave a reviewable PR open, disable auto-merge, and mark the issue as
  waiting for maintainer action instead of merging a documented partial.

## Scope

This workflow applies to:

- `reactor/`
- `ops/`
- service/runtime control surfaces
- core prompts and governance files
- triage and orchestration rules
- deployment/merge policy
- privileged internal or admin behavior

## OpenReactor proposals

If an issue is labeled `openreactor-core`, agents should treat it as an
OpenReactor issue.

OpenReactor issues may still be shaped by user insight, but they should not be
handled as ordinary public feature requests. Unless maintainer steering is
clear, they should default toward banking, proposal handling, or explicit human
review rather than direct autonomous implementation.

One explicit exception is watchdog-generated repair work. When the local
watchdog detects a concrete OpenReactor-core fault that is blocking normal
issue flow, it may open a maintainer-steered `openreactor-core` repair issue so
the reactor can fix OpenReactor itself. After that repair merges, the watchdog
is expected to refresh the local checkout and restart the local OpenReactor
services.

## Runtime visibility

OpenReactor may publish a read-only runtime metadata feed from the local
machine so the product can show:

- which agents are currently running
- which issues are stalled or paused
- which items are waiting on maintainer action
- whether the local reactor and watchdog services are healthy

This visibility layer should expose metadata only. It should not expose secrets,
terminal output, or arbitrary file contents, and it should not let the website
control the local OpenReactor services.

## Autonomous Test Run

OpenReactor includes a named self-test technique: the **Autonomous Test Run**.

Its purpose is to run a small, deliberate OpenReactor-core issue through the
same workflow that normal work uses:

- issue creation
- trusted maintainer steering
- triage
- implementation
- PR creation
- merge readiness
- documentation updates

The command is:

```bash
bun run openreactor:self-test
```

The Autonomous Test Run should stay minimal and safe. It is a canary for the
workflow, not a place to smuggle in broad OpenReactor refactors.

## Documentation rule

Agents working on OpenReactor are expected to pass on durable learnings by
updating:

- `OPENREACTOR_WORKFLOW.md`
- `CONSTITUTION.md`
- `MEMORY.md`
- relevant files in `prompts/`
- other nearby OpenReactor docs

OpenReactor should improve not only by changing code, but by preserving the
workflow and lessons that make future autonomous work safer and clearer.
