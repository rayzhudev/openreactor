# openreactor Repo State

This directory is the product steering layer for the OpenReactor product.

OpenReactor itself is the shared autonomous issue-to-PR execution engine. This
repo's product state describes the public OpenReactor website, request intake,
queue visibility, playground surface, and the maintainer-controlled engine
workflow that those product surfaces explain.

Agents should treat these files as the repo-local source of product truth:

- `PRODUCT_SPEC.md`: current OpenReactor product behavior and limitations
- `PRODUCT_CONSTITUTION.md`: durable product rules
- `TRIAGE_POLICY.md`: request classification and routing rules
- `ROADMAP.md`: current sequencing
- `MEMORY.md`: durable decisions and lessons

For new managed products, this directory should usually be created by a Project
Genesis conversation with a ChatGPT/Codex agent before OpenReactor starts
implementation. Genesis writes concrete product steering files and a small
initial backlog; the reactor then consumes that committed state.
