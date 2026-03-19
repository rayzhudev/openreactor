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
- Product-specific memory and steering should live with the target repo in a
  committed repo-local state layer, instead of being trapped only in the
  shared OpenReactor engine repo.
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
- If the selected implementation provider is unavailable, OpenReactor should
  retry the run through the other provider before giving up on the issue. Only
  when both providers appear unavailable should it pause the issue and wait for
  provider recovery.
- If an issue includes reference images, OpenReactor should treat them as
  first-class input. Codex-capable runs should receive the actual image files,
  not only markdown links to them. If another implementation path cannot
  accept deterministic image attachments yet, OpenReactor should route that
  issue through a path that can.
- OpenReactor should refresh PR execution footers after the run finishes so
  the final PR body deterministically reflects the implementation agent that
  actually produced the result.
- OpenReactor should instruct implementation agents to leave a concise,
  human-useful implementation report in PR descriptions instead of relying only
  on raw metadata or a bare checklist.
- When OpenReactor decomposes an oversized issue, it should create GitHub-native
  sub-issues for the child tasks and add issue dependencies only for true
  blocking relationships, so independent child tasks can still run in
  parallel.
- When a product issue is blocked on a maintainer-only prerequisite, OpenReactor
  should leave a reviewable PR open, disable auto-merge, and mark the issue as
  waiting for maintainer action instead of merging a documented partial.
- In that maintainer-handoff path, OpenReactor should tag the repo owner on the
  issue and the PR so the notification goes to the single highest-authority
  maintainer rather than broadcasting to all contributors.

## Scope

This workflow applies to:

- `reactor/`
- `ops/`
- service/runtime control surfaces
- core prompts and governance files
- triage and orchestration rules
- deployment/merge policy
- privileged internal or admin behavior

## Repo-local state

OpenReactor should separate:

- shared engine/runtime code
- repo-local product steering state

The repo-local state is where product-specific direction, roadmap, and durable
memory should live for a managed repository. The current committed layout is:

- `.openreactor/repo/README.md`
- `.openreactor/repo/PRODUCT_SPEC.md`
- `.openreactor/repo/PRODUCT_CONSTITUTION.md`
- `.openreactor/repo/ROADMAP.md`
- `.openreactor/repo/MEMORY.md`

When those files exist, issue agents and triage should prefer them over the
legacy top-level product docs.

For managed repos, initialization should prefer inference over blank setup:

- read the repo README
- read the initial GitHub issues, especially a PRD-style issue if one exists
- infer a first-pass product description and product constitution from that
  material
- open a bootstrap PR that creates `.openreactor/repo/`

The current bootstrap helper seeds that first pass from the repo README and the
existing GitHub issues when those inputs are available.

The current local deployment model is intentionally simple:

- clone the target repo onto the machine that already runs OpenReactor
- point the local OpenReactor engine at that clone
- start a dedicated local OpenReactor instance for that repo, including its
  own reactor, watchdog, and metadata endpoint
- let the reactor open the bootstrap PR automatically if `.openreactor/repo/`
  does not already exist on `main`
- begin normal issue handling only after that repo-local steering state exists

Legacy repos that already have the older top-level product docs may continue to
run while the bootstrap PR is open. Repos that do not have either repo-local
state or the legacy top-level docs should wait for the bootstrap first.

This avoids a separate onboarding wizard while still keeping the runtime local
and the per-repo steering state committed inside the managed repository.

Each managed repo should also get its own local read-only metadata endpoint.
Those endpoints are for maintainer visibility and debugging from a trusted
machine such as a laptop; they are not meant to be automatically wired into the
OpenReactor website for arbitrary third-party repos.

OpenReactor's default external UX should be GitHub-native. It should not
assume that every managed repo also exposes a public intake website.

Privilege should also be inferred from GitHub first:

- repo owners have the strongest steering authority
- maintainers and contributors count as privileged steering entities
- ordinary issue authors still go through the normal governance filters
- trusted owner/contributor issues should preserve their explicit requested
  scope unless a hard blocker requires decomposition or human handoff; do not
  quietly reduce them for implementation convenience

The first runtime implementation of that trust model should come from GitHub's
native `author_association` on issues and comments rather than from
OpenReactor-only metadata.

OpenReactor should not inherit a human maintainer's local git identity for
authored commits. Even when the runtime is operating on a maintainer-owned
machine, issue worktrees should be configured with an explicit OpenReactor
machine identity so commit authorship is visibly automated.
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
