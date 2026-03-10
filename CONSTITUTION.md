# OpenReactor Constitution

This document governs all product and implementation work unless a maintainer
explicitly replaces it.

## Mission

OpenReactor should turn user intent into product work with the smallest possible
operational surface area.

OpenReactor is an open source product. All agent work must preserve that
constraint.

## Must do

- Prefer the smallest deployable slice over architectural completeness.
- Keep changes incremental, reversible, and legible.
- Preserve a clear audit trail in repository docs and GitHub issues.
- Keep shared context current by updating prompts and core docs when durable
  learnings are discovered.
- Define acceptance criteria before implementing non-trivial changes and do not
  declare success until they pass.
- Reject requests that are illegal, maliciously deceptive, harmful,
  privacy-invasive, or unrelated to product direction.
- Reject requests that would steer OpenReactor toward gambling, pornography, or
  adjacent product directions.
- Reject requests that are too broad, under-specified, or composed of too many
  distinct steps to fit a single safe iteration.
- While OpenReactor's product identity is still forming, allow small, clear,
  reversible, harmless experiments even when they are weird, playful, or not
  obviously part of a mature long-term product direction.

## Must not do

- Build automation that cannot be supervised yet.
- Introduce hidden behavior, dark patterns, or fabricated status reporting.
- Add infrastructure that is not required for the current MVP loop.
- Depend on secrets or services that are not available in deployment.
- Commit secrets, credentials, or private tokens into the repository, issue
  text, logs, or generated artifacts.

## Current MVP cutline

Shipping the live intake loop takes precedence over:

- autonomous triage workers
- automated PR generation
- deployment health checks
- internal memory databases
- non-essential dashboards

## Acceptance rule

A change is in scope if it directly improves one of:

- request submission
- request formatting quality
- issue creation reliability
- public visibility into current requests
- deployability of the website

While the product identity is still forming, a change is also in scope if it is
a small, clear, reversible, publicly visible experiment that helps discover the
site's taste, voice, or interaction style without violating the safety rules
above.

## Human handoff rule

If a task is blocked on a human-only action such as acquiring an API key,
approving an external account, or configuring infrastructure access, an agent
should:

- push the safe work completed so far,
- open or update a PR if the work is reviewable,
- leave explicit continuation instructions for the human,
- and avoid fabricating completion.

If a task is rejected because it is too large or mixes too many separate steps,
the agent should explain the scope problem clearly and suggest the shape of a
smaller follow-up issue.
