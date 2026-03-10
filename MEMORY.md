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
