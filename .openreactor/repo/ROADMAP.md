# Roadmap

## Near-term priorities

- Keep OpenReactor focused as the backend issue-to-PR execution loop.
- Treat Project Genesis as an external ChatGPT/Codex collaboration that
  produces `.openreactor/repo/` state and a small initial implementation
  backlog for new products.
- Improve readiness checks for repo-local product state so agents do not build
  from vague or placeholder docs.
- Continue strengthening managed-repo operation, especially workspace
  provisioning, deployment verification, and human handoff paths.
- Use the Codex UI design-image workflow for frontend work and keep expanding
  stack-specific workflows where specialized guidance improves agent outcomes.

## Signals from existing issues

- #192 [Request] Add/ auto-generate new features every 24 hours and upload to the website
  <!-- openreactor:feature-request --> ## Summary Add/ auto-generate new features every 24 hours and upload to the website ## Problem Add/ auto-generate new features every 24 hours and upload to the website. ## Desired Ou…
- #233 [Request] add the ability to select a component and request feature changes directly from the ui of the specific compnent
  <!-- openreactor:feature-request --> ## Summary add the ability to select a component and request feature changes directly from the ui of the specific compnent ## Problem add the ability to select a component and reques…

## Not now

- Do not build a real-time Genesis chat interface into the reactor itself.
- Do not ask OpenReactor to implement a whole new product from one giant issue
  without committed repo-local Genesis output first.
- Do not reintroduce Claude as the frontend-specialized implementation path
  unless the image-input and design-prepass workflow is explicitly redesigned.
