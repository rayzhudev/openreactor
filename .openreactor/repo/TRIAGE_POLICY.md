# Triage Policy

This file contains OpenReactor-product-specific request judgment rules. Shared
OpenReactor engine prompts should stay generic and defer to this file for repo
behavior.

## Surface map

- `main` covers the normal OpenReactor product surfaces:
  - homepage
  - request intake
  - GitHub sign-in
  - request queue and archive
  - live visibility surfaces for the OpenReactor product
- `playground` is the intentionally experimental, permissive surface at
  `/playground/`.
- `openreactor-core` is the engine itself:
  - reactor orchestration
  - watchdog behavior
  - prompts
  - merge/deadlock policy
  - other maintainer-controlled OpenReactor mechanisms

## Sensitivity map

- `low`:
  - isolated experiments
  - reversible side pages
  - `/playground/` work
- `medium`:
  - shared UI patterns
  - navigation
  - important but non-defining product flows
- `high`:
  - homepage identity
  - brand voice
  - core UX framing
  - deployment-critical behavior
  - privileged internal/admin capabilities
  - OpenReactor engine changes

## Dispatch heuristics

- Do not reject a request solely because it implies substantial backend or
  implementation work.
- Route frontend/design-heavy requests to the Codex UI workflow so a generated
  design image and brief are created before implementation.
- Route large but directionally valid full-stack work to planning when it needs
  decomposition across UI, backend/API, data model, infrastructure, mobile,
  AI/agent behavior, data ingestion, security/auth/payments, or deployment
  slices.
- Reject requests that would publish, reproduce, translate, or route large
  amounts of copyrighted third-party text, media, or other protected content
  without clear rights to do so. Those are not refinement problems; they are
  out-of-bounds product requests.
- Reject feedback-lane requests that would heavily repurpose the homepage or
  other high-sensitivity core product surfaces for unrelated large features.
  Unaffiliated feedback may influence those surfaces incrementally, but it
  should not redirect them into unrelated product directions without steering.
- For this repo, public feedback is meant to shape the OpenReactor product
  surfaces, especially the website and the experimental `/playground/`.
- For feedback-lane issues in this repo, large feature requests that would
  materially reshape the main product, core flows, or roadmap should not be
  dispatched immediately from a single public suggestion alone.
- Those larger feedback-lane requests should usually be banked until they gain
  stronger validation through one or more of:
  - stronger public support or repeated demand
  - clarifying discussion that narrows the scope into a safer concrete slice
  - explicit steering from the repo owner or another user with real repo write
    access
- Apply that validation gate before decomposition. Do not send a large
  feedback-lane request to the planner just to turn an under-validated parent
  request into a large set of child issues.
- Harmless weird, prankish, parody, or absurd requests should usually route to
  `playground` instead of being rejected just because they do not fit the main
  product flow.
- Core-engine work should only be dispatched from steering-lane requests.

## Feedback vs steering

- Feedback-lane issues may shape only the OpenReactor product surfaces.
- Steering-lane issues may shape both the product surfaces and
  `openreactor-core`.
