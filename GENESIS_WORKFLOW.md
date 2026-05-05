# Project Genesis Workflow

Project Genesis is the interactive product-design phase that happens before
OpenReactor begins autonomous implementation work on a new product.

OpenReactor itself is not the right interface for this phase. The reactor is a
backend execution loop that consumes committed product state and GitHub issues.
It is intentionally asynchronous, GitHub-native, and not optimized for live
back-and-forth clarification with a human.

The Genesis phase should usually be run with a ChatGPT/Codex agent in direct
collaboration with the product owner. That agent's job is to turn an initial
product prompt into OpenReactor-ready repo state and a small implementation
backlog.

## Boundary

Genesis agent responsibilities:

- clarify the product idea through conversation
- challenge weak assumptions or over-broad scope
- decide the smallest coherent v0 product nucleus
- choose or document the intended stack and platform targets
- identify human-only setup steps, secrets, accounts, and infrastructure
- write repo-local product steering files under `.openreactor/repo/`
- optionally create an initial implementation issue backlog

OpenReactor responsibilities after Genesis:

- read the committed repo-local product state
- triage future GitHub issues against that state
- decompose oversized implementation work when needed
- create branches, pull requests, verification evidence, and handoffs
- keep product memory and workflow docs current as implementation changes land

OpenReactor should not be treated as the live interview surface for Genesis.
If the product direction is still being negotiated, keep it in the Codex
conversation until the output is concrete enough to commit.

## Required Outputs

A completed Genesis pass should produce these files:

- `.openreactor/repo/README.md`
- `.openreactor/repo/PRODUCT_SPEC.md`
- `.openreactor/repo/PRODUCT_CONSTITUTION.md`
- `.openreactor/repo/TRIAGE_POLICY.md`
- `.openreactor/repo/ROADMAP.md`
- `.openreactor/repo/MEMORY.md`

It may also produce:

- `UI_SYSTEM.md` or `.openreactor/repo/UI_SYSTEM.md` for products with rendered UI
- `workspace-policy.json` or `.openreactor/repo/workspace-policy.json`
- stack-specific notes or setup docs guided by `STACK_WORKFLOWS.md`
- initial GitHub issues for the first implementation slices
- setup documentation for required external services

## Product Spec Contract

`.openreactor/repo/PRODUCT_SPEC.md` should describe the current intended
product, not an unbounded wish list.

It should include:

- product summary
- target users and primary jobs-to-be-done
- supported platforms, such as web, mobile, backend service, or infrastructure
- core workflows for v0
- explicit v0 scope
- what is planned later
- what is explicitly deferred
- data model and integration assumptions when relevant
- current limitations that implementation agents must not pretend are solved

For a brand-new repo, "current" means the approved Genesis target state that
OpenReactor should start building toward.

## Product Constitution Contract

`.openreactor/repo/PRODUCT_CONSTITUTION.md` should define durable product
rules.

It should include:

- product mission
- non-negotiable product principles
- safety, privacy, legal, and content boundaries
- what kinds of requests should be rejected
- what kinds of requests should be banked for later
- human handoff rules for secrets, accounts, paid services, deployment access,
  app-store work, infrastructure approval, or other maintainer-only actions

## Triage Policy Contract

`.openreactor/repo/TRIAGE_POLICY.md` should tell OpenReactor how to classify
future requests for this product.

It should include:

- surface map for `main`, `playground`, and `openreactor-core` when applicable
- sensitivity map for low, medium, and high-risk product areas
- what ordinary public feedback may change
- what only steering-lane requests may change
- dispatch heuristics for backend, mobile, infrastructure, data ingestion, or
  other large product-critical work
- examples of requests that should be rejected, banked, decomposed, or
  dispatched

## Roadmap Contract

`.openreactor/repo/ROADMAP.md` should sequence the first build, not just collect
ideas.

It should include:

- Now: the smallest useful product nucleus
- Next: obvious follow-on work after the nucleus is working
- Later: larger enhancements that should not distract early implementation
- Not now: ideas that are explicitly deferred or out of scope

The "Now" section should be small enough to become a short implementation
backlog. Genesis should avoid handing OpenReactor a giant multi-month plan as
one undifferentiated request.

## Memory Contract

`.openreactor/repo/MEMORY.md` should preserve durable decisions from the
Genesis conversation.

Each decision should include:

- date
- decision
- reason

Good memory entries explain why the product is shaped a certain way, what was
intentionally deferred, and which tradeoffs future agents should not re-litigate
without new evidence.

## Workspace Policy Contract

If the product needs setup beyond the default package commands, Genesis should
create a workspace policy file.

Use `.openreactor/repo/workspace-policy.json` when the policy is product-local.
Use root `workspace-policy.json` only for legacy repos or when the repo has not
adopted `.openreactor/repo/` yet.

The policy should document:

- provision command
- teardown command when needed
- required non-secret environment variable defaults
- assumptions about local services, emulators, databases, or mobile simulators

Do not commit secrets. If a secret or external account is required, document it
as a human handoff in the product constitution, roadmap, or setup docs.

## Stack Workflow Contract

Genesis should identify which stack workflows the product needs. Use
`STACK_WORKFLOWS.md` as the standing menu of execution patterns.

At minimum, Genesis should call out whether the initial build includes:

- frontend or UI work
- backend/API work
- database or data model work
- infrastructure or deployment work
- mobile app work
- AI/agent behavior
- data ingestion or scraping
- security, auth, or payments

For UI-heavy products, Genesis should expect OpenReactor to use the Codex UI
workflow: an `xhigh` reasoning design-image prepass creates a concrete UI image
and design brief, then that image is attached to the frontend implementation
agent.

## Initial Issue Backlog Contract

Genesis may create initial GitHub issues after the repo-local state is written.
If it does, prefer 3 to 8 implementation issues.

Each issue should:

- be one coherent implementation slice
- include acceptance criteria
- name relevant product docs or roadmap items
- call out platform, backend, mobile, or infrastructure requirements
- include human-only setup blockers when they exist
- avoid starting with `[Request]` unless it is going through the public intake
  path
- avoid using the public intake marker unless the issue truly came from that
  path

Dependencies should be used only for real blockers. Independent slices should
remain parallelizable.

## Readiness Checklist

A repo is ready for OpenReactor implementation when:

- the required `.openreactor/repo/` docs exist and are not placeholders
- v0 scope is concrete enough for implementation agents to judge completion
- high-sensitivity surfaces and steering-only areas are identified
- setup, test, and deployment assumptions are documented
- human-only prerequisites are explicit
- the first implementation backlog is small, sequenced, and reviewable
- there are no committed secrets or private credentials

Use this local check before starting the reactor on a Genesis output:

```bash
bun run reactor:tool check-genesis
```

If those conditions are not met, continue the Genesis conversation instead of
starting the reactor on vague product state.
