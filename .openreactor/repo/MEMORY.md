# Memory

Record durable product and workflow learnings here.

## Bootstrap context

OpenReactor is an agentic harness that allows software products to evolve on
their own.

The core idea is simple: the full product lifecycle can now be automated, not
just the code-writing step. Requests can enter a system, get judged, get turned
into real product work, move through branches and pull requests, deploy, and
feed their learnings back into the system again.

## Decisions

- Add dated decisions with a short reason so future agents inherit them.
- Decision: in the `openreactor` repo, large feedback-lane feature requests
  should require stronger validation before dispatch.
  Reason: public product feedback should still shape the website and
  `/playground/`, but one unaffiliated large request should not be enough to
  commit the product to a major new direction without stronger evidence,
  narrowing discussion, or explicit steering. That validation should happen
  before decomposition, so under-validated parent requests do not become a
  large child-issue backlog by default.
