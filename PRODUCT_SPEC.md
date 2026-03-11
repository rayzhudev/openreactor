# OpenReactor — Product Spec (v0.2)

## 1) Vision
OpenReactor is a self-building software platform where users propose features, and autonomous coding agents evaluate, implement, and deploy accepted changes.

## 2) Core Principle
Users provide intent via feature requests (issues).
OpenReactor turns intent into shipped product improvements, while enforcing:
- legal/safety constraints,
- product coherence,
- scoped execution.

## 3) Product Constitution (Agent-Shared)
This document is binding for all agents unless superseded by explicit maintainer updates.

### 3.1 Must do
- Keep product direction coherent with current roadmap.
- Prefer small, incremental, reversible changes.
- Document decisions in shared memory docs.
- Reject requests that are illegal, harmful, privacy-invasive, or clearly malicious.

### 3.2 Must not do
- Implement unlawful or morally gray capabilities.
- Add unrelated features that fragment product identity.
- Introduce hidden behavior, dark patterns, or deceptive UX.
- Bypass repo policy files or constitution constraints.

### 3.3 Scope filter
A request should be rejected/deferred if:
- effort is too large for one iteration,
- it requires unavailable infrastructure/secrets,
- it significantly diverges from current product direction.

## 4) User Experience (MVP)
1. User submits feature request in web form.
2. System creates GitHub issue using structured template.
3. Request enters the reactor queue and is claimed with a GitHub label.
4. Lightweight triage classifies surface sensitivity and evidence strength, then decides whether to `reject`, `bank`, or dispatch the request.
5. If dispatched, an issue agent decides whether the request should be `accepted`, `rejected`, or decomposed into smaller follow-up issues.
6. If accepted, the issue agent may reinterpret the request and create the best product change, then open a branch + PR.
7. On merge to `main`, the website deploys automatically.

## 5) System Architecture (MVP)
- Frontend: public website for request intake and queue visibility
- Website backend: API/backend for intake and future product features that require stored data
- Reactor runtime: machine-local agent orchestration loop that polls GitHub, claims issues, spawns fresh agents, and retries until resolution
- Watchdog runtime: machine-local supervisor that monitors the reactor, stalled issues, and repeated startup failures, then attempts limited self-healing
- GitHub integration: issues, labels, comments, branches, PRs, merge state
- Persistence (current): GitHub for durable workflow state, local `.openreactor/` files for transient run state
- Persistence (planned): application database for website/backend features that require stored data

## 6) Data Model (MVP)
Current agent-workflow state lives in:
- GitHub issues
- GitHub labels and comments
- GitHub pull requests
- local `.openreactor/runs/*` state files

Planned backend data model for product features that require stored data:
- feature_requests
- agent_runs
- pull_requests
- deployments
- health_checks
- memory_events

## 7) Agent Prompting Framework
Each run receives:
- `CONSTITUTION.md`
- `ROADMAP.md`
- `MEMORY.md`
- prompt files in `prompts/`
- current issue body + labels + context
- local run files such as `plan.json` and `progress.md`

Final issue outcomes are:
- `accepted`
- `rejected`

Internal run outcomes may also include:
- `retry`
- `decomposed`

Agent behavior requirements:
- treat the issue as product feedback, not a binding implementation spec
- classify the sensitivity of the affected surface and the evidence strength for acting now
- bank worthwhile ideas when the evidence is too weak for the sensitivity level instead of rejecting them prematurely
- reject requests that are harmful, incoherent, or not worth building
- if accepted, choose the best product change even if it differs from the literal request
- maintain issue comments/labels, testing notes, and PR linkage as part of the run

## 7.1) Canonical GitHub Support Signal

OpenReactor uses one public support signal in GitHub:

- the count of `:+1:` reactions on the root issue body

OpenReactor must not create parallel support state in labels, issue comments,
PR comments, check runs, local run files, or product-side counters just to track
"votes." Those surfaces may discuss support, but the canonical count stays the
native GitHub reaction count on the issue itself.

Support is evidence, not approval:

- it can raise priority for a coherent in-scope request
- it can help move an issue from weak evidence toward moderate or strong
  evidence
- it cannot by itself force acceptance or implementation

Sensitivity changes how much support matters:

- low-sensitivity requests may be meaningfully strengthened by even a small
  amount of support
- medium-sensitivity requests should usually need around 3 `:+1:` reactions
  before support materially upgrades their evidence
- high-sensitivity requests should usually need around 5 `:+1:` reactions
  before support materially upgrades their evidence, and still need explicit
  agent justification

Hard limits:

- support never overrides safety rules
- support never overrides maintainer-only boundaries
- support never makes a secret-dependent or unavailable-access request feasible
- support never replaces the agent's product judgment about scope, coherence, or
  risk

## 8) Backend Strategy
Split the product backend from the agent runtime:
- Cloudflare Pages + Functions power the public website and its API surface today
- a separate website backend remains planned for features that need durable stored data
- the machine-local `reactor/` runtime handles autonomous issue processing
- GitHub polling is the current trigger mechanism; webhooks are optional later
- GitHub + local run files are sufficient for the first autonomous loop
- richer backend storage remains planned when the product itself needs it

## 9) Deployment and CD
- Main branch deploys automatically.
- Website deployment currently happens through Git-connected Cloudflare Pages.
- Post-deploy health tracking is still to be implemented.
- Failures should eventually open/append to an incident issue.

## 10) Security and Secrets
- Start secret-light; avoid external APIs where possible.
- Add secret manager compatibility from day one (env bindings abstraction).
- No secrets in repo, issue text, or logs.

## 11) Observability
Dashboard should show:
- request queue status
- accepted/rejected rates
- PR cycle time
- deployment success/failure
- latest product memory updates

Current state:
- only the public request queue is implemented
- the rest of the observability surface is still pending

## 12) Non-goals (MVP)
- Full autonomy across infrastructure migrations
- Complex paid billing system
- Multi-repo orchestration
- Fully unsupervised high-risk backend rewrites

## 13) Initial Milestones
1. Naming + constitution + docs baseline
2. Intake form → GitHub issue creation
3. Public queue + GitHub App auth
4. Local `reactor/` loop with issue claiming and fresh-context retries
5. End-to-end accepted issue flow creating PRs
6. Auto deploy health checks + transparency dashboard

## 14) Open Questions
- Exact merge policy for high-risk file paths?
- How strict should request rate limits be at launch?
- Which changes require human approval despite autonomy?
- How should roadmap priorities be updated over time?

## 15) Current MVP Cutline

As of March 9, 2026, the implementation target is intentionally narrower than
the full product vision.

What is already live:

1. a live website,
2. a structured feature request form,
3. GitHub issue creation from that form,
4. a public queue view of submitted requests,
5. and a first local `reactor/` loop for autonomous issue processing.
6. and a local watchdog layer that supervises the reactor and stalled issue handling.

The following are still deferred:

- reliable end-to-end PR creation on real issues,
- PR follow-up and merge-state handling,
- deployment health tracking,
- application-backed stored data features for the website/backend,
- and a full transparency dashboard.
