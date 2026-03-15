# Product Memory

## 2026-03-09

- Decision: treat GitHub issues as the initial system of record.
  Reason: it eliminates the need for a database and admin UI in v1.

- Decision: deploy the website on Cloudflare Pages with Functions.
  Reason: it is the fastest path to a live site with an API and public frontend.

- Decision: keep the agent orchestration runtime separate from the website backend.
  Reason: the website still needs a backend for product features with stored data, but the autonomous agent loop is operationally simpler on this machine.

- Decision: build the autonomous loop as a local `reactor/` runtime first.
  Reason: it fits long-running agent execution, git worktrees, and local testing better than forcing the first loop into Cloudflare infrastructure.

- Decision: require structured request fields instead of free-form text only.
  Reason: better issue quality now is more valuable than workflow complexity.

## 2026-03-10

- Decision: reject repetitive placeholder or gibberish intake text before it becomes a GitHub issue.
  Reason: queue quality is part of the MVP, and low-signal requests create noise without adding actionable product feedback.

- Decision: treat a merged PR as valid completion evidence for an accepted issue branch, not just an open PR.
  Reason: accepted work is often squash-merged before later retries or reconciliation runs inspect branch state.

- Decision: allow submitters to optionally provide a GitHub username and carry it through the issue body for commit attribution.
  Reason: accepted changes should be able to credit the requester without adding a separate identity system outside GitHub.

- Decision: publish a single reactor-managed status comment on each claimed issue and surface that detail in the public queue.
  Reason: visibility into running work belongs in the existing GitHub issue and queue MVP, not in a separate dashboard yet.

- Decision: include `agent-browser` in the issue-agent environment and prompt agents to use it for UI verification.
  Reason: the local reactor loop needs a cheap way to validate rendered changes, not just file diffs, when agents modify the site.

- Decision: use native GitHub issue comments as the public discussion layer for queued requests until the product has an application-backed backend.
  Reason: it adds visible feedback and acceptance signal without introducing new persistence or moderation infrastructure during the MVP intake loop.

## 2026-03-11

- Decision: credit merged issue-loop PRs on the public leaderboard to the requester's optional GitHub username when the issue body provides one.
  Reason: issue-branch PR authors are often the reactor bot, so public contribution credit should follow the request attribution captured in the issue itself.
- Decision: treat trusted maintainer signals as the source of maintainer
  steering, not raw issue-body text.
  Reason: free-text usernames are spoofable. Maintainer steering should come
  from the real GitHub issue author matching the repo owner or from trusted
  labels applied by OpenReactor intake/decomposition flows.

- Decision: treat native GitHub `:+1:` reactions on the root issue body as the canonical support signal, with higher support expected before it materially upgrades evidence on higher-sensitivity requests.
  Reason: popularity should stay GitHub-native and visible without creating parallel vote state, while still remaining subordinate to safety, maintainer boundaries, and secret-dependent feasibility limits.

- Decision: let signed-in website support actions write through to the same GitHub `:+1:` issue reaction instead of creating a website-side vote ledger.
  Reason: the queue can add a convenient support UI without splitting canonical support state away from GitHub.

- Decision: use the signed-in GitHub session as the canonical contributor
  identity for website submissions and remove the free-text GitHub username
  field from intake.
  Reason: free-text usernames are spoofable, while authenticated GitHub login
  lets accepted work credit a real account without requiring login for all
  submissions.

- Decision: preserve trusted submitter and maintainer-steering metadata when
  decomposing a parent issue into child issues.
  Reason: child issues should inherit the same trust posture as the parent
  request instead of being reclassified as random public feedback.

- Decision: ship a browser-local `My requests` section before adding application-backed request history or inbox features.
  Reason: submitters need a lightweight way to find their own issues now, while durable per-user state still sits beyond the MVP cutline.

- Decision: route rejected-request clarification through GitHub issue comments and require rejection messages to name the governing rule.
  Reason: the product already exposes GitHub as the public discussion layer, so clearer rejection reasons plus direct comment follow-up solve the need without adding a second conversation system.

- Decision: supervise the local reactor with a separate local watchdog instead of folding service-health recovery into the reactor loop itself.
  Reason: the reactor should focus on issue execution, while a watchdog can restart the service, unpause retryable issues, and escalate non-recoverable failures without entangling supervision logic into every issue run.

- Decision: let the watchdog open maintainer-steered `openreactor-core` repair issues when it detects a concrete OpenReactor fault that blocks issue flow.
  Reason: OpenReactor should not only recover operationally. It should also be able to route concrete faults in its own workflow back through the same autonomous issue-to-PR loop, then refresh the local services after the repair merges.

- Decision: branch new issue worktrees from freshly fetched `origin/main`
  instead of the local `main` ref.
  Reason: local `main` can lag behind remote and create avoidable merge
  conflicts across concurrently running issue branches.

- Decision: keep CSS minimal by convention rather than enforcing a hard byte budget through scripts.
  Reason: the tendency to add lots of CSS is what causes bad design. Agents should default to the fewest possible custom styles, leaning on Tailwind utilities and avoiding decorative flourishes like gradients, shadows, and backdrop blurs.

- Decision: when a request expresses a useful product pressure through an
  overly literal or unrealistic hard constraint, agents should prefer adapting
  it into a narrower accepted change rather than rejecting the direction
  outright.
  Reason: strong numeric or absolute requests often carry a valid product
  signal even when the literal target would be counterproductive.

- Decision: treat UI quality as a governed system concern by requiring agents
  to follow `UI_SYSTEM.md` and provide browser verification evidence for
  accepted rendered-UI changes.
  Reason: frontend quality decays quickly when autonomous changes rely only on
  local code edits and taste drift, so the reactor needs both a shared visual
  baseline and runtime enforcement.

- Decision: if a worthwhile feature is blocked on a maintainer-only prerequisite
  such as OAuth setup or secret provisioning, OpenReactor should leave a
  reviewable PR open with auto-merge disabled and mark it as requiring
  maintainer action instead of merging a documented partial.
  Reason: maintainer-blocked features need a real waiting state in the workflow,
  not just handoff text inside an otherwise accepted PR.

- Decision: expose local OpenReactor runtime state through a machine-local
  read-only metadata service and let the website handle visualization.
  Reason: the product should be able to show what OpenReactor is doing without
  turning the website into the runtime control plane or exposing arbitrary local
  state.

- Decision: shape `/api/openreactor-status` around explicit pipeline stages,
  with GitHub-backed intake metadata added at the website proxy and local
  runtime stages supplied by the machine-local status service.
  Reason: homepage visualizations need a stable stage-oriented contract for
  intake, planning, execution, retry, blocked, and completed flow, while the
  metadata-only boundary still needs to stay intact.

- Decision: treat GitHub issue discussion as live product input and allow later
  comments to trigger re-triage of banked, paused, or previously rejected
  issues.
  Reason: worthwhile requests should be able to mature through discussion
  instead of being frozen forever by their first wording.

- Decision: discussion-driven re-triage should be keyed off live GitHub thread
  state, not depend on whether a previous bank/reject step happened to persist
  a local run record.
  Reason: a product manager would revisit a maturing discussion thread based on
  what people are saying now, even if no earlier local execution state exists.

- Decision: all reactor-authored decision comments should carry an explicit
  OpenReactor marker and be excluded from discussion-trigger logic.
  Reason: comment authorship alone is not a strong enough filter. OpenReactor
  should never mistake its own decision narrative for new human discussion,
  even if future integrations post through a non-bot identity.
- Decision: surface OpenReactor execution metadata in GitHub-visible workflow
  artifacts whenever the runtime knows it directly.
  Reason: provider, model, reasoning effort, and duration are hard facts that
  help explain how OpenReactor is operating without relying on vague narrative
  alone.
- Decision: refresh PR execution footers from the reactor after a run finishes
  instead of relying only on the earlier `ensure-pr` write.
  Reason: the implementation execution metadata is only complete after the
  agent exits, so a reactor-owned final refresh is the deterministic way to
  make the PR body reflect the agent that actually finished the work.

- Decision: once a running issue blows past roughly eight iterations without a
  PR, the watchdog should treat it as a workflow fault and open concrete
  OpenReactor repair work instead of assuming more retries are productive.
  Reason: iteration counts that high are a clear signal that something is wrong
  operationally, not just that the feature needs a little more time. The right
  response is to fix the workflow, not just jiggle the process.

- Decision: formalize a repeatable OpenReactor canary issue as the
  **Autonomous Test Run**.
  Reason: OpenReactor needs a named automated test-run technique that exercises
  the full issue-to-PR workflow end to end, so regressions are caught by a
  real run instead of only by waiting for ordinary feature work to expose them.

## 2026-03-15

- Decision: surface banked/deferred requests in the public queue as a distinct
  `Needs Refinement` status and persist that state with a dedicated GitHub
  `needs-refinement` label.
  Reason: deferred requests should stay visible for follow-up, but they should
  not look identical to fresh queued work.

- Decision: give the planner its own higher-reasoning configuration and let it
  create GitHub-native sub-issues plus dependency edges for decomposed work.
  Reason: decomposition needs more careful sequencing judgment than ordinary
  implementation, and native issue dependencies let OpenReactor avoid starting
  blocked child tasks while still allowing independent children to run in
  parallel.
