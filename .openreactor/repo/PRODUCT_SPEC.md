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
