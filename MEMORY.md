# Product Memory

## 2026-04-30

- Decision: default OpenAI-backed Codex reactor runs now use `gpt-5.5` for
  triage, planning, and implementation while preserving the existing
  role-specific reasoning efforts.
  Reason: current OpenAI guidance names `gpt-5.5` as the latest model and
  recommends starting migrations by updating the model string while tuning
  prompts and reasoning effort against the workflow rather than changing every
  parameter at once.

- Decision: keep OpenReactor's agent prompts outcome-first while preserving
  the detailed product, governance, and GitHub contracts the workflow depends
  on.
  Reason: GPT-5.5 responds well to explicit outcomes and stopping conditions,
  but OpenReactor still needs durable rules for acceptance, decomposition,
  documentation, validation, and maintainer handoff.

## 2026-04-28

- Decision: use the segmented concentric-ring mark with the orange core as the
  canonical OpenReactor logo and favicon.
  Reason: the mark reads like a reactor target while staying simple enough for
  the topbar and browser favicon. The ring dash lengths should divide evenly
  around the circles so the symbol remains visually balanced.

- Decision: represent the factory-floor source node as a pneumatic task pipe
  with blank cards emerging from the opening.
  Reason: a pipe communicates that new work items spawn into the factory more
  immediately than a generic hopper, while avoiding text or product-specific
  logos at the 75px runtime size.

- Decision: keep the factory-floor drone provider logo on a dedicated top
  plate and remove the runtime text label from drone sprites.
  Reason: the provider mark is the stable identity signal for an agent. A
  centered plate plus fixed CSS measurements keeps the SVG logo aligned with
  the generated chassis, while the text label overlapped stations and made the
  sprite read less like a game object.

- Decision: use simple controlled role-overlay PNG symbols instead of accepting
  generated role overlays that resemble tiny labels or number badges.
  Reason: role overlays render at about 5-9px in the drone assembly. At that
  size, deterministic high-contrast symbols stay clearer and avoid accidental
  text/numerals from image generation.

- Decision: cap visible factory-floor sink tokens to the latest three items and
  expose the full pile through the sink node tooltip.
  Reason: letting every completed issue or PR remain visibly stacked on a
  75x75px pile quickly creates clutter. Showing the latest three preserves
  motion/history feedback, while clicking the pile keeps older outcomes
  available on demand.

## 2026-04-24

- Decision: replace the factory-floor sprite production process with a
  Codex-native image generation workflow documented in `packages/factory-floor/SPRITES.md`.
  Reason: the old ChatGPT Mac app automation path added brittle OS-level steps
  and made the asset pipeline harder to reproduce from the repo itself.

- Decision: keep factory-floor token status indicators renderer-built instead
  of shipping generated badge PNGs.
  Reason: maintainer handoff, stalled, fallback/rate-limit, CI failure, and
  merge-conflict indicators render at about 12px, where generated raster badges
  add large emitted assets without beating the clarity of controlled symbols.

- Decision: generate non-overlay factory-floor sprites against an explicit
  tile-grid scaffold and use a brighter, more glanceable industrial palette.
  Reason: source, sink, station, watchdog, and drone body sprites need to fit
  fixed runtime footprints. A grid scaffold makes edge alignment and visual
  mass deliberate, while a lighter palette improves readability in the live
  renderer.

## 2026-04-11

- Decision: downscale generated factory-floor sprite downloads to package-ready
  resolutions before importing them into the embeddable renderer.
  Reason: Vite library mode inlines imported image assets into the shipped JS
  bundle. Raw 1024px ChatGPT downloads make the package balloon quickly, while
  the visualization only renders those sprites at small on-screen sizes.

- Decision: remove plain white background connected to the canvas edge from
  generated factory-floor sprite downloads before accepting them into the repo.
  Reason: ChatGPT app exports arrive as flattened PNGs with a white matte, but
  the renderer needs transparent sprite assets so the floor grid and other
  layered visuals do not pick up white boxes around the art.

- Decision: import shipped factory-floor PNG assets with Vite's `?no-inline`
  suffix instead of relying on default library-mode asset handling.
  Reason: Vite library mode always inlines imported assets into the JS bundle
  by default, which made the embeddable package explode past 10 MB once the
  full sprite set was wired into the renderer. Explicit `?no-inline` imports
  keep the package lean while still shipping hashed asset files.

- Decision: keep factory-floor provider logos as controlled SVG assets instead
  of generated raster badge overlays.
  Reason: provider marks are tiny, high-precision symbols that need to stay
  crisp and stable at small runtime sizes. SVG logos scale better, bundle more
  cleanly, and avoid the visual drift that came from generated badge PNGs.

- Decision: avoid complete machine-like conveyor sprites for factory-floor.
  Reason: the visualization draws arbitrary straight runs, corners, and retry
  loops, so full assembled conveyor illustrations do not compose cleanly across
  routes.

- Decision: render factory-floor conveyors as grid-aligned cell runs composed
  from canonical renderer-built straight and corner tiles, with flow motion
  animated separately in code.
  Reason: stamping whole belt images along curved SVG paths still produces seam
  risk and weak turn handling, while generated belt art drifts too easily for
  infrastructure that must join perfectly. A discrete cell model matches the
  layout grid, rotates cleanly into all cardinal directions, and keeps
  tessellation and animation concerns separate.

- Decision: resolve factory-floor conveyor visuals per occupied grid cell across
  the whole belt network rather than rendering each edge independently.
  Reason: Factorio-style side-loading and merges require a cell that belongs to
  a straight run to stay visually straight even when a perpendicular feed joins
  it. Per-edge rendering incorrectly turns those shared cells into corners and
  produces wrong arrow directions.

- Decision: derive each conveyor tile's geometry from its incoming and outgoing
  sides rather than rotating a canonical tile by `enter`/`exit` direction.
  Reason: `enter` in the routed belt cells represents travel direction from the
  previous cell, not the literal side where the belt enters the current tile.
  Converting that direction into an actual incoming side avoids mirrored corner
  turns and backwards-pointing flow arrows.

- Decision: continue factory-floor sprite rollout one asset at a time, and
  integrate each accepted asset into the live renderer before generating the
  next one.
  Reason: judging generated sprites in isolation led to drift and wasted
  generations. Integrating each sprite immediately into the demo keeps style,
  scale, and package constraints visible while decisions are still cheap.

- Decision: render moving factory-floor issue and pull-request items from
  renderer-built glyphs instead of generated sprites, with belt-moving tokens
  suppressing numeric badges.
  Reason: tiny moving items lose too much identity when detailed generated
  artwork is tinted and scaled to conveyor size. Code-native glyphs stay crisp,
  tunable, and readable, and hiding number badges on moving tokens prevents the
  badge from overwhelming the icon.

- Decision: model factory-floor artifact kind as explicit item lifecycle state,
  not as a stage-based visual inference, and reserve the merged sink for pull
  requests only.
  Reason: inferring issue-vs-PR from node position let decomposed issues leak
  into the merged pile and made post-PR retry states regress back to issue
  visuals. Explicit artifact kind keeps retries, waiting PRs, and merged output
  semantically correct while decomposed issues terminate separately at triage.

- Decision: keep the factory-floor waiting zone PR-only and represent
  decomposition by child issues returning to intake rather than by a visible
  decomposed pile.
  Reason: the real workflow only enters maintainer waiting when there is a
  reviewable PR open, so separate issue-vs-PR waiting lanes would be misleading.
  For decomposition, the operationally meaningful visible effect is new child
  issues joining intake; the parent issue closing as decomposed is bookkeeping,
  not factory throughput.

- Decision: trim transparent outer padding from station sprites and fit sprite
  nodes exactly to their tile bounds in the renderer.
  Reason: the earlier overscan rule only existed to hide padded PNG exports. It
  caused station art to bleed outside its assigned footprint and made conveyors
  miss the visible bench edge. Trimmed station art plus exact-fit rendering
  keeps the scene reading like a game board instead of floating stickers.

- Decision: let downward station-output belts extend one tile into the station
  footprint and keep the belt layer explicitly below entity sprites.
  Reason: game-like readability is better when the outgoing belt appears to run
  under the station face instead of starting with a visible gap below it.
  Making the z-order explicit avoids future regressions when DOM order or
  renderer composition changes.

## 2026-03-23

- Decision: treat `PRODUCT_SPEC.md` as both the current-state product source of
  truth and the near-term plan, with explicit separation between shipped and
  planned behavior.
  Reason: agents had started shipping meaningful capability changes without
  updating the spec, which made the written product picture lag the code and
  blurred the line between what is live now and what remains aspirational.

- Decision: require a documentation-routing audit as part of non-trivial
  autonomous implementation work.
  Reason: telling agents to "update docs" is too vague. They work better when
  the repo says which file owns which kind of truth and when each file must be
  updated.

## 2026-03-25

- Decision: split the old visualization spec into a generic automation-status
  contract and a separate factory-floor renderer spec.
  Reason: the status API needs to remain renderer-agnostic and portable across
  autonomous systems, while the factory-floor package is only one consumer of
  that operational model.

- Decision: treat workflow topology plus runtime snapshot as the primary status
  model for observability, not a pipeline-stage array tied to OpenReactor's
  current layout.
  Reason: a graph-based model can represent OpenReactor and other autonomous
  systems without forcing UI-specific or workflow-specific assumptions into the
  API.

- Decision: carry OpenReactor-specific observability detail in
  `extensions.openreactor` on top of the generic automation-status contract.
  Reason: the shared standard should stay portable across other autonomous
  systems, while OpenReactor still needs to expose issue numbers, PR links,
  tool metadata, and other repo-specific details for its own UI.

- Decision: publish the automation-status standard with a machine-readable JSON
  Schema and example payload alongside the prose spec.
  Reason: a reusable observability standard should be implementable by other
  systems without requiring them to infer field shapes only from narrative docs
  or from OpenReactor's own source code.

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
- Decision: when a maintainer-hand-off PR is merged manually, OpenReactor
  should close the source issue automatically on the next reconciliation tick.
  Reason: a maintainer-merged PR is the terminal success condition for that
  workflow, so leaving the issue open would strand completed work in a stale
  `waiting-maintainer` state.

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

- Decision: write the local run record before claiming a fresh issue with
  `or:running`, and give the watchdog a short running-claim grace period before
  it clears a supposedly stale claim.
  Reason: a freshly claimed issue can otherwise race the watchdog, which may
  see the label before the run record exists and incorrectly strip the claim
  from live work.

- Decision: if GitHub's native auto-merge is unsupported for a repo, the PR
  helper should fall back to a direct merge for clean accepted PRs instead of
  leaving them open forever.
  Reason: some managed repos do not use protected-branch auto-merge, and
  stalled accepted PRs can deadlock downstream issue dependencies even though
  the work is already mergeable.

- Decision: the reactor should reconcile already-accepted open PRs after the
  run ends and merge them when they are clean, complete, and not intentionally
  waiting on maintainer action or native auto-merge.
  Reason: accepted runs can still leave a PR open because of timing, GitHub
  feature differences, or earlier helper failures, and that stale PR state can
  deadlock downstream issue dependencies.

- Decision: the watchdog should detect an idle queue stuck behind accepted PRs
  and attempt operational deadlock recovery before escalating it.
  Reason: when the reactor is healthy but every remaining task is blocked
  behind a stranded accepted PR, restarting blindly is not enough. The system
  should either merge the completed PR or reclaim the conflicted branch so work
  continues automatically.

- Decision: managed repos should route OpenReactor repair work back into the
  central OpenReactor engine repo instead of keeping those repair issues local
  to the managed product repo.
  Reason: workflow failures discovered while serving another repo still need to
  improve the shared engine. The repair should land in one place, then the
  watchdog should redeploy that updated engine to the affected local instances.

- Decision: when a maintainer raises an OpenReactor-core problem, land the
  durable engine/workflow fix first and, whenever feasible, let that fix heal
  the already-stuck work instead of doing a separate one-off manual recovery.
  Reason: OpenReactor should not keep relearning the same operational lessons
  one incident at a time, and it should converge back to forward progress from
  partially broken states through its own repaired workflow.

- Decision: treat idempotency and resumability as core OpenReactor properties,
  not narrow recovery details.
  Reason: the whole system should be safe to replay after partial failure, so
  retries, reconciliations, and resumed runs converge on the same intended
  state instead of depending on bespoke cleanup.

- Decision: conflicted maintainer-authored core PRs outside the normal
  `openreactor/issue-*` branch pattern should still be surfaced as explicit
  OpenReactor repair work.
  Reason: manual core PRs can otherwise fall outside the issue-loop conflict
  repair sweep and sit invisible even though they are blocking engine changes.

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
- Decision: if the selected implementation provider is unavailable, OpenReactor
  should retry the issue through the other provider before pausing it.
  Reason: transient Claude/OpenAI outages are common enough that automatic
  cross-provider failover is a cheaper recovery path than immediately burning
  retries or waiting for manual intervention.
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
  Repo owners should have the highest steering authority, users with actual
  repo access (`write`, `maintain`, or `admin`) should count as steering
  entities, and ordinary issue authors should still pass through the normal
  governance filters.
  Reason: GitHub is the natural source of truth for repository trust and
  authorship in the default OpenReactor deployment model.

- Decision: derive `requestAuthority` primarily from GitHub repository
  permissions, not contributor history. OpenReactor-managed labels should act
  only as inherited child-issue metadata when the system decomposes trusted
  steering work.
  Reason: prior contribution history is not the same as present repo authority,
  and the runtime needs a clean split between steering and market feedback.
- Decision: trusted steering-lane issues should preserve their
  explicit requested scope unless a hard blocker requires decomposition or
  human handoff.
  Reason: privileged repo steering should not be silently watered down for
  implementation convenience once OpenReactor has already accepted the
  direction.
- Decision: requests for new data sources, scrapers, ingestion paths, or other
  heavy backend collection work should not be rejected purely for implementation
  complexity when the managed product's core promise depends on coverage or
  completeness.
  Reason: for data-aggregation products, those requests are often the product,
  not optional technical churn.
- Decision: accepted PRs must be validated against GitHub's real check
  runs/statuses before OpenReactor treats them as merge-ready.
  Reason: self-reported test lists are useful, but they are not enough to keep
  a private repo safe when native branch protection is unavailable.
- Decision: bundled feedback should be judged per sub-request rather than as an
  all-or-nothing issue.
  Reason: users should be free to submit one broad workflow critique or a
  bundled feature wishlist without pre-splitting it into implementation-sized
  tickets. OpenReactor should preserve the valid subset through decomposition
  and reject or bank only the parts that actually fail product judgment.

- Decision: in the `rayzhudev/openreactor` repo, feedback-lane issues may
  shape only the website/product surfaces. Direct OpenReactor-core changes
  require steering authority.
  Reason: the public product demo should stay shapeable by feedback, but the
  OpenReactor engine itself remains maintainer-controlled.
- Decision: shared OpenReactor prompts should stay generic, while repo-specific
  request-judgment rules, surface routing, and “core work” heuristics should
  live in repo-local `TRIAGE_POLICY.md`.
  Reason: the engine should be reusable across managed repos, but different
  products need different triage behavior and sensitivity maps.
- Decision: untouched bootstrap placeholders under `.openreactor/repo/`
  should not override richer legacy top-level product docs.
  Reason: placeholder repo-state files can silently strip away real product
  rules and cause incorrect triage decisions until a repo-local policy is
  actually curated.
- Decision: triage should read governance docs from the live repo root, not a
  stale issue worktree snapshot.
  Reason: re-triage must reflect the current product policy even when an old
  issue branch or worktree still has outdated copies of the repo-local docs.

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

- Decision: in the `factory-floor` visualisation, human waiting gates should
  act as inline hold stations on the bottom run of the execution return loop
  instead of sitting on a separate conveyor spur or floating inside the loop.
  Reason: waiting is modeled as a hold/rejoin state around execution, so the
  belt topology should show one coherent interrupted loop rather than a
  misleading side branch or a disconnected box inside the belt path.

- Decision: renderer-built conveyor loops that are interrupted by an inline
  station must derive both belt halves from the interrupting node's occupied
  grid cells rather than from hardcoded resume offsets.
  Reason: when the station moves, fixed resume coordinates create missing belt
  segments and visual gaps. Using the station footprint as the split contract
  keeps loop rendering correct under placement changes.

- Decision: the `factory-floor` watchdog should use a generated idle body
  sprite with code-driven spray particles instead of a mandatory separate
  full-body spraying sprite.
  Reason: the body needs to match the other generated world assets, but the
  spray itself is a small animated effect that is more robust and flexible in
  code than as a second monolithic bitmap variant.
