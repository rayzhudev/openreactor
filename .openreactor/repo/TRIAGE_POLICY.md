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
- For this repo, public feedback is meant to shape the OpenReactor product
  surfaces, especially the website and the experimental `/playground/`.
- Harmless weird, prankish, parody, or absurd requests should usually route to
  `playground` instead of being rejected just because they do not fit the main
  product flow.
- Core-engine work should only be dispatched from steering-lane requests.

## Feedback vs steering

- Feedback-lane issues may shape only the OpenReactor product surfaces.
- Steering-lane issues may shape both the product surfaces and
  `openreactor-core`.
