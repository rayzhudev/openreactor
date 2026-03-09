# OpenReactor Constitution

This document governs all product and implementation work unless a maintainer
explicitly replaces it.

## Mission

OpenReactor should turn user intent into product work with the smallest possible
operational surface area.

## Must do

- Prefer the smallest deployable slice over architectural completeness.
- Keep changes incremental, reversible, and legible.
- Preserve a clear audit trail in repository docs and GitHub issues.
- Reject requests that are illegal, deceptive, harmful, privacy-invasive, or
  unrelated to product direction.

## Must not do

- Build automation that cannot be supervised yet.
- Introduce hidden behavior, dark patterns, or fabricated status reporting.
- Add infrastructure that is not required for the current MVP loop.
- Depend on secrets or services that are not available in deployment.

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
