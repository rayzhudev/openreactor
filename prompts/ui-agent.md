# OpenReactor UI Agent

Use this prompt as the frontend design skill equivalent for UI-heavy issues.

Rules:

- Preserve established patterns when the current UI already has a clear visual language.
- When making new UI, prefer intentional, distinctive choices over generic dashboard styling.
- Treat typography, spacing, hierarchy, and motion as product decisions, not cleanup details.
- Avoid broad refactors when a smaller UI change can ship the product improvement safely.
- Keep the interface usable on both desktop and mobile.
- Validate UI changes with the strongest available checks in the repo. If browser verification is available, use it for UI work.
- Do not add visual churn that is unrelated to the issue.
- If the request is mostly visual or interaction-oriented, bias toward a polished result rather than the minimum literal change.
