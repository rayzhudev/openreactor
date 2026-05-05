# OpenReactor — Product Spec (v0.3)

## 0) How To Read This Spec
This spec serves two jobs:

- describe the current implemented product and workflow
- describe planned direction where it is explicitly marked as planned, deferred, or an open question

Current implemented behavior is the primary source of truth. Planned sections
should shape future work, but they should not be mistaken for something that is
already shipped.

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
- effort is too large for one iteration and cannot be usefully decomposed,
- it requires unavailable infrastructure/secrets with no safe implementation
  slice or human handoff path,
- it significantly diverges from current product direction.

## 4) User Experience (MVP)
1. User submits a feature request through the website's lightweight intake form.
   The current intake surface is intentionally simple: one request field,
   desired scope, and optional reference images.
2. System converts that submission into a structured GitHub issue template.
   When GitHub API-backed intake is unavailable, it can fall back to a GitHub
   issue creation redirect instead of dropping the request.
3. Request enters the reactor queue and is claimed with a GitHub label.
4. Lightweight triage classifies surface sensitivity and evidence strength, then decides whether to `reject`, `bank`, or dispatch the request.
5. Ongoing issue discussion can refine the request; banked, paused, or previously rejected issues may be reconsidered when later comments materially change the task or explicitly call OpenReactor back in.
6. If dispatched, an issue agent decides whether the request should be `accepted`, `rejected`, or decomposed into smaller follow-up issues.
7. Decomposed follow-up issues may be linked with GitHub-native dependencies when one child task truly blocks another. Independent child tasks should remain parallelizable.
8. If accepted, the issue agent may reinterpret the request and create the best product change, then open a branch + PR.
9. If the remaining step is maintainer-only, the run may pause in a maintainer handoff state with an open PR and explicit continuation instructions.
10. Clean accepted PRs may be merged automatically by the reactor or watchdog, depending on repository capabilities and current runtime state.
11. On merge to `main`, the website deploys automatically.

## 4.1) Project Genesis

For a brand-new product, the initial product-design phase is intentionally
outside the OpenReactor runtime.

Project Genesis should be a real-time collaboration between the product owner
and a ChatGPT/Codex agent. That agent turns the initial product prompt into
OpenReactor-ready repo-local state, including product spec, constitution,
triage policy, roadmap, memory, optional workspace policy, and a small initial
issue backlog.

OpenReactor then consumes the committed Genesis output as backend execution
state. The reactor should not be treated as the interactive planning surface
for new-product discovery.

The shipped contract for this workflow is documented in
`GENESIS_WORKFLOW.md`.

## 5) System Architecture (MVP)
- Frontend: public website for request intake and queue visibility
- Website backend: API/backend for intake and future product features that require stored data
- Reactor runtime: machine-local agent orchestration loop that polls GitHub, claims issues, spawns fresh agents, and retries until resolution
- Watchdog runtime: machine-local supervisor that monitors the reactor, stalled issues, and repeated startup failures, attempts operational self-healing, and can emit concrete OpenReactor repair issues when the workflow itself needs to be fixed
- OpenReactor Autonomous Test Run: a deliberate automated canary issue that
  exercises the issue-to-PR loop end to end so workflow regressions are caught
  through a real run
- OpenReactor status service: machine-local read-only metadata endpoint that exposes intake, triage/planning, execution, retry, blocked, and completed pipeline metadata to the website without giving the website direct control over the local runtime
- OpenReactor status contract: a graph-oriented automation-status payload that is intended to generalize beyond OpenReactor-specific pipeline layouts, with OpenReactor details carried in namespaced extensions
- Project Genesis contract: documented external ChatGPT/Codex planning workflow that produces OpenReactor-ready repo-local product state before the reactor begins implementation on a new product
- Stack workflow contract: documented stack-specific execution patterns for frontend, backend/API, database, infrastructure, mobile, AI/agent, data ingestion, security/auth/payments, and full-stack builds
- GitHub integration: issues, labels, comments, branches, PRs, merge state
- Persistence (current): GitHub for durable workflow state, local `.openreactor/` files for transient run state such as run records, event logs, transcripts, live snapshots, watchdog state, archives, and repo-local steering/workspace-policy files
- Persistence (planned): application database for website/backend features that require stored data

## 6) Data Model (MVP)
Current agent-workflow state lives in:
- GitHub issues
- GitHub labels and comments
- GitHub pull requests
- local `.openreactor/runs/*` state files
- repo-local `workspace-policy.json` or `.openreactor/repo/workspace-policy.json` execution policy files
- generated UI design prepass artifacts for Codex UI runs:
  `ui-design-reference.svg` and `ui-design-brief.md` in the issue run
  directory

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
- `UI_SYSTEM.md` when the issue touches rendered UI
- prompt files in `prompts/`
- current issue body + labels + context
- local run files such as `plan.json` and `progress.md`

Default OpenAI-backed Codex runs currently target `gpt-5.5` for triage,
planning, and implementation. The default reasoning efforts remain tuned by
role: `low` for triage, `high` for planning, and `medium` for implementation.
Operators can override those defaults with the corresponding
`OPENREACTOR_*_MODEL` and `OPENREACTOR_*_REASONING_EFFORT` environment
variables.

Final issue outcomes are:
- `accepted`
- `rejected`

Internal run outcomes may also include:
- `retry`
- `decomposed`
- `bank`

Workflow-visible execution states may also include:
- `banked`
- `waiting-maintainer`
- `failed`

Agent behavior requirements:
- derive whether the issue is steering or market feedback from GitHub repo
  authority and treat those lanes differently
- classify the sensitivity of the affected surface and the evidence strength for acting now
- bank worthwhile ideas when the evidence is too weak for the sensitivity level instead of rejecting them prematurely
- reject requests that are harmful, incoherent, or not worth building
- if accepted from the feedback lane, choose the best product change even if it differs from the literal request
- if accepted from the steering lane, preserve explicit scope unless a hard
  blocker requires decomposition or human handoff
- maintain issue comments/labels, testing notes, and PR linkage as part of the run
- enforce minimum acceptance evidence for shipped work, including a real branch,
  a real PR, and at least one passing reported check
- require browser-verification evidence before accepting UI work
- route frontend/design-heavy issues to the Codex UI agent, which first runs a
  Codex `xhigh` design-image prepass and then feeds the generated image into
  the implementation run with any issue-provided reference images
- use stack-specific workflow guidance from `STACK_WORKFLOWS.md` when a request
  touches backend/API, data model, infrastructure, mobile, AI/agent, data
  ingestion, security/auth/payments, or broad full-stack app work

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
- workspace policy provision commands now run during managed-repo issue startup
  before the implementation agent starts, with non-secret policy environment
  values forwarded into agent processes

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
- the public request queue is implemented
- the website also ships a richer live OpenReactor surface showing pipeline
  stages, service health, active agents, retries, blocked work, and recent
  completed runs
- the embeddable `@openreactor/factory-floor` renderer now uses brighter
  tile-grid-scaffolded generated station sprites for intake, triage/planning,
  and execution, generated sink pile sprites for merged and rejected output,
  sprite-composed agent drones
  using a shared chassis plus provider and role overlays, and generated
  watchdog idle/spraying body sprites while keeping conveyors renderer-built
  and code-animated; human waiting gates remain renderer-built dashed hold
  stations that interrupt the bottom run of the execution return loop, waiting
  work in the demo re-enters execution when the blocker clears and is treated
  as PR-only maintainer handoff work, watchdog spray remains procedural
  particle animation, and moving work items still render from renderer-built
  issue and pull-request glyphs tinted by runtime state in code; numeric
  identifiers are hidden on belt-moving tokens and shown where items have more
  visual space, renderer-built status symbols are used for maintainer handoff,
  stalled work, fallback/rate-limit, CI failure, and merge-conflict states so
  those tiny overlays stay crisp at token scale, the merged sink is reserved
  for pull requests only, sink piles show only the latest three completed
  issue/PR tokens in the scene while sink click tooltips list the pile contents
  newest-first, rejected issues
  remain the visible triage side-output, and decomposed parent issues no
  longer sit in a visible sink because the meaningful factory-floor effect of
  decomposition is the child issues re-entering intake as fresh issue work
- the live status payload is now moving toward a generic automation-status
  standard so other autonomous systems can publish compatible observability
  data without inheriting OpenReactor's UI layout assumptions
- the live surface now also exposes recent runtime events and transcript
  previews from active runs
- the website ships a contributor leaderboard derived from merged PRs
- accepted/rejected aggregate rates, PR cycle-time reporting, deployment
  success/failure reporting, and memory-update reporting are still pending

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

## 15) Current Shipped State And MVP Cutline

As of March 23, 2026, the implementation target is still intentionally narrower
than the full product vision, but the code has moved materially beyond the
original March 9 cutline.

What is already live:

1. a live website,
2. a lightweight intake form that is transformed into a structured GitHub issue,
3. GitHub issue creation from that form, with GitHub redirect fallback when
   API-backed intake is unavailable,
4. optional signed-in GitHub attribution for submissions and support actions,
5. optional reference-image upload support for intake,
6. a public queue view of submitted requests,
7. browser-local "My requests" tracking for submissions made from the current
   browser,
8. a contributor leaderboard based on merged PRs,
9. a live OpenReactor website view of intake and local runtime metadata,
10. a local `reactor/` loop for autonomous issue processing,
11. discussion-triggered reconsideration of banked, paused, or previously
    rejected issues,
12. decomposition into GitHub-native child issues with dependency edges when
    work must be sequenced,
13. accepted-run validation that requires a real branch, a real PR, and passing
    reported checks,
14. accepted PR reconciliation and merge-state handling,
15. maintainer-handoff support for maintainer-only continuation steps,
16. a local watchdog layer that supervises the reactor, stalled issue handling,
    queue deadlocks, and some OpenReactor self-repair cases,
17. a repo-scoped workspace policy file that can inject runtime env and run
    provision/teardown hooks around isolated issue worktrees,
18. structured per-run event and transcript artifacts that feed the live status
    surface with recent activity and transcript previews,
19. a shared status contract package used by the local status service and the
    website bridge,
20. an OpenReactor Autonomous Test Run command for deliberate end-to-end
    canary verification,
21. and a documented Project Genesis output contract for preparing
    OpenReactor-ready repo-local state through an external ChatGPT/Codex
    planning conversation.

The following are still deferred:

- deployment health tracking,
- incident issue creation from deployment failures,
- accepted/rejected aggregate metrics in the public site,
- PR cycle-time reporting in the public site,
- latest product-memory reporting in the public site,
- first-class Genesis automation or a hosted interactive Genesis UI,
- application-backed stored data features for the website/backend,
- and richer product features that genuinely require a separate durable backend.
