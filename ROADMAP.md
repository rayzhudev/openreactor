# Roadmap

## Now

Stabilize OpenReactor as a backend execution loop for products whose product
state has already been made explicit:

1. Keep the autonomous issue-to-PR loop reliable.
2. Treat Project Genesis as an external ChatGPT/Codex workflow that produces
   OpenReactor-ready repo-local state.
3. Keep `.openreactor/repo/` docs curated enough that agents inherit concrete
   product truth instead of placeholders.
4. Use stack-specific workflows so frontend, backend, mobile, infrastructure,
   AI, data, security, and full-stack app work get sharper instructions than a
   generic coding-agent pass.
5. Preserve observability through the public queue, status feed, and runtime
   artifacts.

## Next

Improve readiness for new full-product builds:

1. Add deployment health tracking and incident issue creation.
2. Tighten prompts, plans, and quality gates based on live managed-repo runs.
3. Add richer stack profiles when live failures show repeated gaps.
4. Add targeted evals for Genesis output quality and UI design-prepass quality.

## Later

Only after repeated live usage validates the workflow:

1. Add application-backed stored data features for the website/backend
2. Add persistent internal state beyond GitHub where it is actually needed
3. Add first-class Genesis automation or hosted Genesis UI only if the external
   Codex workflow proves insufficient
4. Expand multi-repo and infrastructure orchestration once the local model is
   reliable
