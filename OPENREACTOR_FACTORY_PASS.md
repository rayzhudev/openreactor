# OpenReactor Factory Pass

The Factory Pass is OpenReactor's deliberate end-to-end canary run.

Its purpose is to exercise the real autonomous workflow as if the system were
running a sample unit through a factory line:

- issue creation
- claim and triage
- implementation
- PR creation
- merge readiness
- documentation/memory updates

The Factory Pass should stay small and safe. It exists to prove the loop still
works, not to ship a large feature.

## How To Use It

- Create or reuse the self-test issue with `bun run openreactor:self-test`.
- Let the normal reactor handle it through the ordinary issue flow.
- Record what was exercised and what was learned.

## Pass Log

- 2026-03-13: Factory Pass framework added to the repo. No completed pass has
  been recorded yet.
