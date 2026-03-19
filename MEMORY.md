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
- Decision: when a run enters the maintainer-handoff state, OpenReactor should
  tag the repo owner on both the issue and the PR.
  Reason: maintainer-only steps need a deterministic GitHub notification path,
  and that notification should go to the single highest-authority maintainer
  instead of all contributors.

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

- Decision: prompt issue agents to include a short implementation report in PR
  descriptions, not just metadata and test output.
  Reason: humans need a useful explanation of what changed, why the approach
  was chosen, what was discovered, and how problems were handled when reading
  OpenReactor-created PRs.

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

## 2026-03-19

- Decision: persist intake-form reference image uploads in a dedicated
  GitHub-backed assets branch and embed those hosted URLs into the created
  issue body.
  Reason: the current MVP has no separate storage system for website uploads,
  but maintainers still need request images to survive the intake flow and stay
  visible to issue agents inside GitHub.

- Decision: when an issue carries reference images, download them into the
  issue run directory and attach them directly to Codex agent runs as real
  image input.
  Reason: markdown image links in the issue body are not a reliable substitute
  for actual multimodal input when an agent needs to inspect a UI reference or
  other uploaded image while implementing the issue, and Claude Code can read
  image files by local path when that directory is included in its allowed
  scope.

- Decision: start separating shared OpenReactor runtime code from repo-local
  product steering state by introducing a committed `.openreactor/repo/`
  directory.
  Reason: OpenReactor should eventually manage many repos, and each repo needs
  its own product memory, roadmap, and constitution without having to vendor
  the whole OpenReactor engine into that repo.
- Decision: each managed repo should get its own local OpenReactor status
  endpoint on this machine.
  Reason: maintainers need per-instance visibility for debugging and oversight,
  but those extra endpoints should stay laptop/local-facing by default instead
  of being automatically wired into the public OpenReactor website.
- Decision: the intended onboarding flow for managed repos should infer a
  first-pass product description from the repo README and existing GitHub
  issues, then open a bootstrap PR creating `.openreactor/repo/`.
  Reason: end users should not need to hand-author every OpenReactor steering
  file from scratch before the system can begin, and most early product
  context already exists in the repo README or a PRD-style issue.

- Decision: the repo-state bootstrap helper should seed its first-pass files
  from the repo README and the existing GitHub issues when those inputs are
  available.
  Reason: even a lightweight inferred seed is better than starting from blank
  product steering files during onboarding.

- Decision: managed repos should not need a separate onboarding wizard after
  GitHub App install. The local OpenReactor runtime should infer first-pass
  repo state automatically and open a bootstrap PR the first time it sees a
  repo without committed `.openreactor/repo/` files.
  Reason: the desired product shape is “install the app, start the local
  runtime, and let OpenReactor begin,” not a manual setup flow.

- Decision: legacy repos that already have the older top-level product docs
  should keep running while the bootstrap PR is open, but repos without either
  repo-local state or legacy top-level docs should gate on the bootstrap first.
  Reason: this avoids disrupting the existing OpenReactor repo while still
  making brand-new managed repos initialize themselves before autonomous issue
  work begins.

- Decision: the shared OpenReactor engine should be able to manage another
  locally cloned repo without vendoring the runtime into that target repo.
  Reason: the near-term scaling step is from one repo to two, with both still
  running on the same machine, so engine-root and managed-repo-root need to be
  distinct concepts in the runtime.

- Decision: managed-repo privilege should be inferred from GitHub itself.
  Repo owners should have the highest steering authority, maintainers and
  contributors should count as privileged steering entities, and ordinary issue
  authors should still pass through the normal governance filters.
  Reason: GitHub is the natural source of truth for repository trust and
  authorship in the default OpenReactor deployment model.

- Decision: use GitHub's native `author_association` field as the first runtime
  trust signal for repo-owner and contributor privilege on issues.
  Reason: this lets OpenReactor infer owner/contributor privilege directly from
  the repository instead of relying only on OpenReactor-specific labels or
  body fields.

- Decision: OpenReactor should eventually author commits as the GitHub App or
  another explicit OpenReactor machine identity, not as the maintainer's local
  git identity.
  Reason: the current system already pushes branches using the GitHub token,
  but commit authorship still follows the local git config unless the runtime
  sets it explicitly, which is not the desired long-term behavior for managed
  repos.

- Decision: configure each issue worktree with an explicit OpenReactor git
  author identity and pass the same identity into spawned agents through
  `GIT_AUTHOR_*` and `GIT_COMMITTER_*`.
  Reason: push authentication and commit authorship are different concerns.
  OpenReactor already publishes branches through the GitHub token path, but it
  also needs explicit git author settings so commits do not inherit the local
  machine user's identity.
