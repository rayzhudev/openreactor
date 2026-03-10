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

- Decision: credit merged issue-loop PRs on the public leaderboard to the requester's optional GitHub username when the issue body provides one.
  Reason: issue-branch PR authors are often the reactor bot, so public contribution credit should follow the request attribution captured in the issue itself.
