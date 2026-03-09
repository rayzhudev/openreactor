# Product Memory

## 2026-03-09

- Decision: treat GitHub issues as the initial system of record.
  Reason: it eliminates the need for a database and admin UI in v1.

- Decision: deploy the MVP as a single Cloudflare Worker with static assets.
  Reason: it is the fastest path to a live site with an API and public frontend.

- Decision: defer autonomous triage and implementation workers.
  Reason: the first bottleneck is collecting clean, structured requests.

- Decision: require structured request fields instead of free-form text only.
  Reason: better issue quality now is more valuable than workflow complexity.
