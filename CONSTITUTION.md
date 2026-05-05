# OpenReactor Governance Boundary

This file defines the boundary between:

- **OpenReactor itself**, which is the workflow that governs autonomous product
  evolution
- the **OpenReactor product**, which is the public-facing website and
  experience that OpenReactor is currently building

Both matter, but they are not governed the same way.

## Core distinction

Users submit feedback that is consumed by OpenReactor.

What that feedback should primarily change is the **product** that OpenReactor
builds, not OpenReactor's own governing core.

OpenReactor itself is the critical mechanism that makes autonomous evolution
possible. That layer is maintainer-controlled.

## Governance model

There are three practical surfaces in this repo:

1. **Product surface**
- public website behavior
- visual design
- intake UX
- public queue, guides, and other user-facing features
- side pages and experiments

This surface is community-shapeable.

2. **Transparency surface**
- public visualizations of what OpenReactor is doing
- explainers
- read-only status views
- public observability of requests, agents, and shipping motion

This surface is also community-shapeable, as long as it does not directly alter
OpenReactor policy or privileged controls.

3. **OpenReactor core**
- reactor orchestration behavior
- triage policy
- agent routing
- merge and deployment policy
- privileged internal/admin controls
- prompt/governance core
- secret-sensitive or infrastructure-sensitive behavior

This surface is maintainer-controlled.

## Hard boundary

Public feedback may influence:

- what the product becomes
- what parts of OpenReactor become visible
- what product directions gain evidence over time

Public feedback must not directly govern:

- how OpenReactor governs itself
- privileged admin behavior
- safety boundaries
- secret handling

OpenReactor-core changes may still be proposed by users, but they should be
treated as proposals for maintainer consideration rather than normal product
requests.

## Source documents

Read the relevant document for the surface you are working on:

- [PRODUCT_CONSTITUTION.md](/home/ray/projects/openreactor/PRODUCT_CONSTITUTION.md)
- [OPENREACTOR_WORKFLOW.md](/home/ray/projects/openreactor/OPENREACTOR_WORKFLOW.md)
- [GENESIS_WORKFLOW.md](/home/ray/projects/openreactor/GENESIS_WORKFLOW.md)
- [STACK_WORKFLOWS.md](/home/ray/projects/openreactor/STACK_WORKFLOWS.md)

If a change crosses the boundary, default to the stricter OpenReactor rules
unless the maintainer has explicitly steered otherwise.

## Documentation rule

Agents working on either OpenReactor or the product are expected to pass on
durable learnings by updating shared docs.

That includes, when appropriate:

- `OPENREACTOR_WORKFLOW.md`
- `PRODUCT_CONSTITUTION.md`
- `MEMORY.md`
- files in `prompts/`
- other nearby architecture or product docs

The point is that OpenReactor should not only change code. It should also
retain what it learns about how to build the product and how to govern itself.
