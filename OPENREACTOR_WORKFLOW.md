# OpenReactor Workflow

This file describes OpenReactor itself.

OpenReactor is the evolving process that receives feedback, triages it, routes
it, opens work, updates docs, and helps the product evolve. It is not best
thought of as a rigid constitution. It is a workflow and technique for making a
product continuously improve itself.

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
- Readability and recoverability matter more than cleverness in core runtime
  code.
- OpenReactor should be allowed to evolve as a process, not frozen as a rigid
  one-time design.

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
