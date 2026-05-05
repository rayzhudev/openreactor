# openreactor Product Spec

## Product summary

OpenReactor is an agentic harness that allows software products to evolve on
their own.

The core idea is simple: the full product lifecycle can now be automated, not
just the code-writing step. Requests can enter a system, get judged, get turned
into real product work, move through branches and pull requests, deploy, and
feed their learnings back into the system again.

## Core workflows

- Visitors can submit a product request from the homepage intake form and watch
  public GitHub-backed execution artifacts appear in the queue.
- Visitors can inspect public workflow status, queue state, and shipped work on
  the main intake surface without gaining control over the OpenReactor core.
- Visitors can browse `/playground/` for low-sensitivity experiments and odd
  side pages, including joke-forward features such as the goon material
  recommender, without those experiments redefining the main intake surface.
- Product owners can run an external ChatGPT/Codex Project Genesis
  collaboration before starting OpenReactor on a new repo. Genesis produces
  OpenReactor-ready `.openreactor/repo/` state and a small initial backlog;
  the reactor then consumes that committed state as its backend execution
  input.
- UI-heavy issues route through the Codex UI workflow: Codex first creates a
  generated design image and brief with `xhigh` reasoning, then the
  implementation Codex agent receives that image along with issue-provided
  references.
- Specialized work should follow the stack workflow profiles in
  `STACK_WORKFLOWS.md`, including backend/API, data model, infrastructure,
  mobile, AI/agent, data ingestion, security/auth/payments, and full-stack app
  slices.

Highest-sensitivity flows:

- homepage framing and intake copy
- public workflow transparency that reflects real runtime state
- anything that could blur the line between website product surfaces and the
  OpenReactor core

## Current constraints

- Feedback-lane issues in this repo may change website/product surfaces but not
  OpenReactor core orchestration, prompts, or privileged controls.
- Weird or unserious requests should usually be redirected into
  `/playground/` instead of being rejected outright, as long as they remain
  low-risk and avoid explicit or unsafe content on the main intake surface.
- Public pages should stay lightweight and static-first unless a request
  clearly needs backend or runtime integration.
- OpenReactor should not become the real-time planning interface for Project
  Genesis. Keep interactive product discovery in the external Codex
  conversation and hand the reactor durable repo-local state once the direction
  is concrete.
- Workspace policy provision hooks now run before implementation agents start
  on managed-repo issue worktrees. Secrets still belong outside committed
  policy files.
