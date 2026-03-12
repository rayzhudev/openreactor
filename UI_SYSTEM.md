# OpenReactor UI System

This file defines the standing visual rules for the public OpenReactor product.

The goal is not to freeze the interface. The goal is to stop design entropy.
UI should feel intentional, restrained, and coherent even as many autonomous
changes accumulate over time.

## Design intent

OpenReactor should look:

- calm rather than noisy
- sharp rather than decorative
- editorial rather than dashboard-generic
- contemporary without relying on trendy effects
- lightweight enough that changes feel deliberate

## Visual rules

- Prefer clean hierarchy, spacing, and contrast over ornament.
- Use one accent direction at a time. Do not introduce extra accent colors for
  one-off features.
- Prefer borders, surface shifts, and typography to create separation before
  reaching for shadows, gradients, glows, or blur.
- Avoid glassmorphism, heavy shadows, floating cards everywhere, and decorative
  gradients unless the issue explicitly requires that visual direction.
- Preserve a calm spacing rhythm. Do not pack unrelated controls tightly just
  to fit more on screen.
- Use font weight and size sparingly. Strong hierarchy should come from a small
  number of consistent steps, not lots of ad hoc text treatments.

## Implementation rules

- The design tokens live in `src/input.css`.
- `public/styles.css` is generated output. Do not edit it directly.
- Prefer existing tokens and utilities before inventing new raw values.
- If a new color, radius, spacing, or shadow value is necessary, add it
  deliberately in `src/input.css` and explain why in `progress.md`.
- Prefer Tailwind utilities and small component-layer additions over large
  custom CSS blocks.
- Prefer the existing semantic primitives in `src/input.css` when they fit the
  job, especially:
  - `.or-panel`
  - `.or-button`
  - `.or-nav-link`
  - `.or-note`
  - `.or-badge`
- If you add a new reusable UI pattern, encode it as a clear component or
  documented pattern instead of scattering one-off class combinations.

## Surface sensitivity

- Homepage framing, hero composition, navigation, and overall visual voice are
  high leverage. Keep those changes coherent and evidence-backed.
- Side pages and isolated playful surfaces can experiment more freely.
- Shared primitives should become simpler over time, not more decorative.

## Browser verification

UI work is not complete until it is checked in a browser.

Required for accepted UI changes:

- inspect the changed surface in a browser
- inspect both a desktop-width and narrow/mobile-width layout
- record the browser commands you used in the final `tests` list
- capture at least one browser snapshot or screenshot during verification

Preferred tooling:

- `agent-browser`
- Playwright if the issue already uses it or the repo adds targeted tests

Static code inspection alone is not enough for UI acceptance.
