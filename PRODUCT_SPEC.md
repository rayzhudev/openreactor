# OpenReactor — Product Spec (v0.1)

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
3. Request enters triage queue.
4. Agent marks: accepted / rejected / needs refinement.
5. If accepted, implementation agent creates branch + PR.
6. On merge, deployment runs automatically.

## 5) System Architecture (MVP)
- Frontend: web app (issue submission + transparency dashboard)
- Orchestrator backend: request intake, triage, queue control
- Queue workers: triage, implementation, PR follow-up, deployment checks
- Persistence: SQL DB for state and audit trail
- GitHub integration: issues, branches, PRs, merge state

## 6) Data Model (MVP)
- feature_requests
- triage_decisions
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
- current issue body + labels + context

Agent must output one of:
- REJECT (with reason)
- DEFER (with required clarification)
- IMPLEMENT (with scoped plan)

## 8) Backend Strategy
Target autonomous-friendly backend with built-in deploy and DB:
- Cloudflare Workers (API/orchestrator)
- Cloudflare D1 (database)
- Cloudflare Queues (async jobs)
- Cron triggers (polling/reconciliation)
- GitHub Actions (CI/CD hooks)

## 9) Deployment and CD
- Main branch deploys automatically.
- Post-deploy health check writes status to DB.
- Failures open/append to incident issue.

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

## 12) Non-goals (MVP)
- Full autonomy across infrastructure migrations
- Complex paid billing system
- Multi-repo orchestration
- Fully unsupervised high-risk backend rewrites

## 13) Initial Milestones
1. Naming + constitution + docs baseline
2. Intake form → GitHub issue creation
3. Triage worker with policy gates
4. Implementation worker creating PRs
5. Auto deploy + health checks
6. Transparency dashboard

## 14) Open Questions
- Exact merge policy for high-risk file paths?
- How strict should request rate limits be at launch?
- Which changes require human approval despite autonomy?
- How should roadmap priorities be updated over time?

## 15) Current MVP Cutline

As of March 9, 2026, the implementation target is intentionally narrower than
the full product vision.

The current release goal is:

1. a live website,
2. a structured feature request form,
3. GitHub issue creation from that form,
4. and a public queue view of submitted requests.

The following are explicitly deferred until the intake loop is live:

- autonomous triage workers,
- implementation workers that open PRs,
- SQL-backed internal state,
- deployment health tracking,
- and a full transparency dashboard.
