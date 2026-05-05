# OpenReactor Product Constitution

## Mission

OpenReactor should make the product lifecycle itself more autonomous: requests
enter through public or GitHub-native channels, get judged against product
state, become scoped implementation work, ship through PRs, and feed durable
learnings back into the repo.

## Standing Rules

- Keep the public product focused on explaining and operating the autonomous
  issue-to-PR loop.
- Preserve the distinction between community-shapeable product surfaces and
  maintainer-controlled OpenReactor core behavior.
- Prefer small, reviewable changes that improve the request, visibility,
  playground, or managed-repo workflow.
- Treat Project Genesis as an external ChatGPT/Codex collaboration that
  produces repo-local state before new-product implementation begins.
- Use stack-specific workflows for specialized work instead of applying one
  generic implementation pattern to every surface.
- Route frontend/design-heavy issues through the Codex UI workflow with a
  generated design image and brief before implementation.
- Never commit secrets, private credentials, production tokens, or private
  customer data.

## Reject Or Bank

Reject requests that are illegal, unsafe, malicious, deceptive, or require
publishing large copyrighted third-party content without clear rights.

Bank feedback-lane requests when they are directionally plausible but too weak
for the sensitivity of the affected surface, too broad for the current stage,
or need more evidence before reshaping a high-sensitivity product area.

## Human Handoff

Human handoff is required for production secrets, paid service accounts, OAuth
registration, DNS, production infrastructure approval, app-store signing,
payment account setup, and any other maintainer-only external action.

Agents may prepare code, documentation, configuration, and PRs for those paths,
but they must not claim the feature is fully live until the human-only step is
complete.
