# openreactor

This directory contains the repo-local OpenReactor state for this product.

OpenReactor's shared engine lives outside this repo-local state. What belongs here is the product-specific material that future issue agents should inherit:

- what this repo is for
- what counts as a good change
- what to avoid
- how triage should classify and route requests for this product
- roadmap direction
- durable memory from past work

Treat these files as the product steering layer for this repository.

## Bootstrap signals

### README signal

OpenReactor is an agentic harness that allows software products to evolve on
their own.

The core idea is simple: the full product lifecycle can now be automated, not
just the code-writing step. Requests can enter a system, get judged, get turned
into real product work, move through branches and pull requests, deploy, and
feed their learnings back into the system again.

### Issue signal

- #192 [Request] Add/ auto-generate new features every 24 hours and upload to the website
  <!-- openreactor:feature-request --> ## Summary Add/ auto-generate new features every 24 hours and upload to the website ## Problem Add/ auto-generate new features every 24 hours and upload to the website. ## Desired Ou…
- #233 [Request] add the ability to select a component and request feature changes directly from the ui of the specific compnent
  <!-- openreactor:feature-request --> ## Summary add the ability to select a component and request feature changes directly from the ui of the specific compnent ## Problem add the ability to select a component and reques…
