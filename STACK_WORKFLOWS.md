# OpenReactor Stack Workflows

OpenReactor should not use one generic implementation path for every kind of
software work. Different parts of the stack fail in different ways, so agents
should inherit stack-specific workflow rules when a request touches those
surfaces.

## Frontend And UI

Use `spawn_codex_ui_agent` for visual or interaction-heavy work.

Workflow:

1. Run a Codex UI design prepass with `xhigh` reasoning.
2. Produce a concrete design image and a short design brief in the run
   directory.
3. Feed that generated image, plus any issue-provided reference images, into
   the Codex UI implementation run.
4. Implement against the existing UI system and product constraints.
5. Verify in browser at desktop and narrow/mobile widths before accepting.

The generated design image is not decorative inspiration. It is an
implementation artifact for layout, hierarchy, component density, responsive
behavior, and interaction states. If an issue-provided reference image conflicts
with the generated design image, the issue-provided reference image wins.

## Backend And APIs

Backend work should start from a contract:

- define request/response shapes or function contracts before implementation
- add or update tests around observable behavior
- keep validation, auth, and error cases explicit
- avoid speculative service boundaries
- document any current limitation that remains after the slice ships

For public APIs, include compatibility and failure-mode notes in the PR body.
For internal APIs, prioritize maintainability and tests over premature generic
abstractions.

## Database And Data Model

Data work should be migration-first:

- state the data invariants before changing schema or persistence
- add seed or fixture coverage where possible
- keep migrations idempotent when the platform supports it
- avoid pretending production data was migrated when a human-only step remains
- document rollback or cleanup expectations for maintainer review

If the repo lacks a real database yet, the agent should not invent one unless
the accepted product slice truly needs persistence.

## Infrastructure And Deployment

Infrastructure work should separate planning from applying:

- prepare configuration, scripts, and docs in a PR
- use `workspace-policy.json` for local provision and teardown hooks
- never commit secrets or account-specific credentials
- treat cloud account setup, DNS, paid services, app signing, and production
  deploy permissions as human handoffs unless the repo explicitly provides safe
  automation
- run read-only or local validation where possible before handoff

Agents may prepare infrastructure changes, but they should not claim production
infrastructure is live without evidence from the target environment.

## Mobile Apps

Mobile work needs platform-specific verification:

- identify iOS, Android, or cross-platform targets in the issue plan
- prefer emulator/simulator or platform test commands when available
- verify layout across at least one small and one normal device size for UI work
- treat signing, app-store credentials, push notification keys, and device
  provisioning as human handoffs
- document platform-specific assumptions in the PR body

If no mobile toolchain is configured, the agent should still prepare the code
slice and hand off the missing setup explicitly.

## AI And Agent Features

AI-facing work should be eval-aware:

- prefer structured outputs for machine-read results
- keep stable prompt and tool instructions in durable files
- add small fixtures, eval cases, or transcript-based checks when behavior is
  hard to unit test
- record model, reasoning effort, and tool assumptions
- keep secrets and private prompts out of logs and examples

For OpenAI/Codex-specific work, use current official OpenAI docs when choosing
models, reasoning effort, hosted tools, structured output patterns, or Codex
configuration.

## Data Ingestion And Scraping

Data ingestion work should be rights-aware and repeatable:

- verify that the source can be used legally and safely
- respect rate limits, robots guidance, and terms where applicable
- use fixtures for tests instead of depending on live remote content
- make ingestion idempotent and resumable
- log counts and failures without leaking private data

Requests to publish or transform large copyrighted third-party content without
clear rights should be rejected, not refined into implementation.

## Security, Auth, And Payments

Security-sensitive work requires explicit threat and handoff notes:

- identify trust boundaries, roles, and privileged actions
- test denied paths as well as happy paths
- use test-mode payments and sandbox credentials only
- never commit secrets, tokens, customer data, or private keys
- require maintainer handoff for production OAuth apps, payment accounts,
  production secrets, and policy decisions

Do not accept security, auth, or payment work as complete if the remaining
production step is outside the agent's access.

## Cross-Stack Full-Stack Apps

For full-stack app builds, the planner should decompose by risk boundary:

- product nucleus and acceptance criteria from Genesis
- UI shell and core workflow
- backend/API contract
- data model and persistence
- auth/security if needed
- infrastructure/deployment
- verification and handoff

Independent slices should be parallelizable. True dependencies should be
captured as GitHub issue dependencies instead of implied through issue text.
