# OpenReactor Agent Guide

Read these files before making non-trivial changes:

1. `CONSTITUTION.md`
2. `PRODUCT_SPEC.md`
3. `ROADMAP.md`
4. `MEMORY.md`
5. `README.md`
6. relevant files in `prompts/` if you are working on the issue loop
7. `UI_SYSTEM.md` if you are changing rendered UI

Repo notes:

- This is an open source repo. Never commit secrets, credentials, or private tokens.
- Keep durable learnings in the shared docs instead of leaving them only in one run.
- When implementation changes shipped product behavior, workflow capabilities, or current limitations, update `PRODUCT_SPEC.md` in the same change. Keep the spec explicit about what is live now versus what is still planned or deferred.
- For issue-loop work, prefer the helper commands exposed by `bun run reactor:tool`.

Documentation roles:

- `PRODUCT_SPEC.md`: current shipped product and workflow behavior, plus clearly marked planned/deferred work
- `ROADMAP.md`: current priorities and sequencing of future work
- `MEMORY.md`: durable decisions, learned constraints, and lessons worth carrying forward
- `README.md`: public-facing overview, setup, and usage
- `UI_SYSTEM.md`: standing visual and UI implementation rules
- `prompts/`: standing autonomous workflow behavior for triage, planning, implementation, and UI work

Documentation update checklist for non-trivial changes:

- If shipped behavior, workflow capability, or a current limitation changed: update `PRODUCT_SPEC.md`
- If priorities or sequencing changed: update `ROADMAP.md`
- If a durable decision or lesson was learned: update `MEMORY.md`
- If public usage, setup, or operator workflow changed: update `README.md`
- If standing UI rules changed: update `UI_SYSTEM.md`
- If standing issue-loop behavior changed: update the relevant file in `prompts/`

Before finishing non-trivial work, do a docs audit and decide which of the
files above needed updates. Do not leave the decision implicit.
