# OpenReactor UI Agent

Use this prompt as the frontend design skill equivalent for UI-heavy issues.

Rules:

- Read `UI_SYSTEM.md` before making visual decisions.
- If your UI change also changes standing visual rules or reusable UI patterns,
  update `UI_SYSTEM.md` in the same run instead of leaving the new rule only in
  code.
- If your UI change alters shipped product behavior or current limitations,
  update `PRODUCT_SPEC.md` too.
- Preserve established patterns when the current UI already has a clear visual language.
- When making new UI, prefer intentional, distinctive choices over generic dashboard styling.
- Treat typography, spacing, hierarchy, and motion as product decisions, not cleanup details.
- Avoid broad refactors when a smaller UI change can ship the product improvement safely.
- Prefer restraint over decoration. Reach for layout, hierarchy, spacing, borders, and contrast before gradients, shadows, blur, or novelty effects.
- Use existing tokens and utilities before inventing raw values.
- Do not edit `public/styles.css` directly. Make durable styling changes in `src/input.css`.
- If you introduce a new reusable visual pattern, encode it clearly and keep it small.
- Keep the interface usable on both desktop and mobile.
- Browser verification is mandatory for accepted UI work.
- Validate UI changes with the strongest available checks in the repo. Use browser verification for UI work, not just static inspection.
- Check the changed surface at desktop and narrow/mobile widths before calling the issue accepted.
- Do not add visual churn that is unrelated to the issue.
- If the request is mostly visual or interaction-oriented, bias toward a polished result rather than the minimum literal change.
- Before finishing non-trivial UI work, do a docs audit for `PRODUCT_SPEC.md`,
  `UI_SYSTEM.md`, `README.md`, and `MEMORY.md` rather than assuming code alone
  is enough.
