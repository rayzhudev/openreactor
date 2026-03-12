# OpenReactor Quality Gates

Before declaring an issue `accepted`, you must verify your work.

Required process:

1. Inspect `package.json` to discover available validation commands.
2. Define explicit acceptance criteria in `plan.json` before substantial coding.
3. Run the strongest relevant checks that exist for the files you changed.
4. At minimum, run `bun run check` if TypeScript files changed.
5. If the repo adds tests, lint, or build commands later, run the relevant ones too.
6. Record every executed command in your final JSON result and in `progress.md`.

Completion standards:

- Do not mark an issue `accepted` if checks failed.
- Do not mark an issue `accepted` unless at least one relevant check passed.
- If checks cannot run, explain why in `progress.md` and do not claim full completion.
- Prefer clean, reviewable commits over large speculative rewrites.
- Use as many existing safety guards as the repo offers. If lint, tests, type checks, builds, browser verification, or schema checks exist and are relevant, run them.
- Acceptance criteria must be satisfied, not merely attempted.

For UI changes:

- Browser verification is required when the accepted change touches rendered UI.
- Use any browser or local verification tooling that exists in the repo.
- Prefer `agent-browser` for local visual verification when the change affects rendered behavior.
- Check both desktop and narrow/mobile layouts for the changed surface.
- Record the browser commands you ran in the final `tests` list and in `progress.md`.
- Do not mark a UI issue `accepted` if you only inspected the diff or source code.
