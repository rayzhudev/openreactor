# OpenReactor — Agent Instructions

## CSS Minimalism

Keep CSS minimal. The tendency to pile on styles is what causes bad design.

- Use Tailwind utility classes. Do not add custom CSS unless there is no utility equivalent (e.g., SVG element styles, keyframe animations, pseudo-element hacks).
- No decorative gradients, box-shadows, backdrop-blur, or layered background effects. Use solid colors, thin borders, and whitespace for hierarchy.
- No hover animations like translateY lifts or shadow additions. Color changes only.
- Use `rounded-lg` or `rounded-xl` — never `rounded-full` on buttons/cards or extreme radii like `rounded-[34px]`.
- Use Tailwind's built-in `font-sans` and `font-mono`. Do not define custom font-family tokens.
- Flat design: solid backgrounds, simple borders, minimal color palette. Think Stripe/Linear, not gradient-heavy marketing sites.
- When in doubt, use fewer styles. Three plain lines of markup beat one over-styled component.
