# Memory

## 2026-05-04

- Decision: Project Genesis should be handled by an external ChatGPT/Codex
  agent and expressed as OpenReactor-ready repo-local state, not run as a live
  conversational mode inside OpenReactor.
  Reason: new-product planning needs real-time clarification and pushback,
  while OpenReactor is optimized for asynchronous backend execution from
  committed product docs and GitHub issues.

- Decision: in the `openreactor` repo, large feedback-lane feature requests
  should require stronger validation before dispatch.
  Reason: public product feedback should still shape the website and
  `/playground/`, but one unaffiliated large request should not be enough to
  commit the product to a major new direction without stronger evidence,
  narrowing discussion, or explicit steering. That validation should happen
  before decomposition, so under-validated parent requests do not become a
  large child-issue backlog by default.
- Decision: in the `openreactor` repo, requests to publish or translate large
  amounts of copyrighted third-party content without clear rights should be
  rejected directly rather than banked for refinement.
  Reason: that is an out-of-bounds legal/content-rights problem, not a normal
  product-scope ambiguity.
- Decision: in the `openreactor` repo, unaffiliated feedback should not
  heavily repurpose the homepage or other high-sensitivity core surfaces for
  unrelated large features.
  Reason: those surfaces are product-defining and should only move
  incrementally from feedback unless stronger validation or steering exists.
- Decision: frontend/design-heavy issues should route to Codex UI, not Claude
  UI. The workflow should first create a Codex-generated design image and
  brief with `xhigh` reasoning, then feed the image into the implementation
  Codex agent.
  Reason: visual implementation quality benefits from a concrete image target,
  and Codex is the active frontend agent path for image-attached UI work.
- Decision: keep stack-specific execution guidance in `STACK_WORKFLOWS.md`.
  Reason: full-stack app building needs stronger per-surface workflows for
  frontend, backend/API, data, infrastructure, mobile, AI, ingestion, security,
  and payments than a single generic implementation prompt can provide.
- Decision: managed-repo issue startup should run workspace policy provision
  hooks and forward policy env into agent runs.
  Reason: product builds that need dependencies, local services, or emulators
  should fail early and visibly during provisioning instead of letting the
  implementation agent discover a half-configured workspace late.
