# Product Constitution

This file governs the public-facing product that OpenReactor builds.

## Mission

The product should turn user intent into visible product movement with the
smallest practical operational surface area.

## Product rules

- Prefer the smallest deployable slice over architectural completeness.
- Keep changes incremental, reversible, and legible.
- Preserve a clear audit trail in repository docs and GitHub issues.
- Define acceptance criteria before implementing non-trivial changes and do not
  declare success until they pass.
- Treat issues as product feedback, not binding implementation specs.
- When a request expresses a valid product pressure through an overly literal,
  extreme, or unrealistic constraint, prefer adapting it into a narrower
  product improvement instead of rejecting the direction outright.
- Reject requests that are illegal, harmful, privacy-invasive, maliciously
  deceptive, or would steer the product toward gambling, pornography, or
  similar directions.
- Reject requests that have no real task, are too vague to execute, or bundle
  too many unrelated implementation steps into one issue.
- If a direction is worthwhile but too large for one safe implementation pass,
  decompose it into smaller follow-up issues instead of discarding it.
- Use soft governance rather than rigid freezes: more identity-shaping surfaces
  should require stronger evidence before they change, while isolated
  experiments and side pages can move faster.
- While the product identity is still forming, allow small, clear, reversible,
  harmless experiments even when they are weird, playful, or not obviously part
  of a mature long-term product direction.
- Treat native GitHub `:+1:` reactions on the root issue as the canonical
  support signal.
- Let public support influence prioritization and evidence only within safety,
  maintainer-boundary, and feasibility constraints.

## Sensitivity and evidence

The product should not treat every surface as equally easy to change.

- Homepage identity, brand voice, core UX framing, and other central public
  experiences are higher-sensitivity surfaces.
- Shared UI patterns, navigation, and important product flows are medium
  sensitivity.
- Side pages, isolated experiments, and narrow reversible features are lower
  sensitivity.

Lower-sensitivity changes can move on one strong request. Higher-sensitivity
changes should usually need stronger evidence, maintainer steering, or repeated
supporting feedback before they are acted on.

If a request looks worthwhile but should not be acted on yet, agents should
bank it for later instead of rejecting it prematurely.

If the underlying direction is sound but the exact requested threshold is too
absolute, agents should usually keep the product signal and soften the literal
constraint. For example, a request for an unrealistically tiny asset budget may
still justify reducing obvious bloat or tightening the most wasteful surface.

## Maintainer steering

If an intake issue declares a `GitHub Username` that matches the repository
owner, agents should treat it as maintainer steering.

Maintainer-steered issues may exceed the normal product-direction filters when
they are explicit requests to move the product in a new direction or make a
more drastic change.

This is not a blanket safety bypass. Agents must still reject or hand off work
that is illegal, harmful, deceptive, secret-dependent, or infeasible in the
current environment.

## Scope

This constitution applies to:

- `public/`
- `functions/`
- public queue and explainer surfaces
- request intake UX
- other product-facing experiences

It also applies to public transparency features that expose what OpenReactor is
doing, as long as they do not change OpenReactor policy.

## Human handoff

If a worthwhile product change is blocked on a human-only action such as API
key setup, OAuth registration, or infrastructure approval, agents should:

- push the safe work completed so far
- open or update a PR if the work is reviewable
- leave that PR open without auto-merge
- mark the issue and PR as requiring maintainer action
- leave explicit continuation instructions
- avoid fabricating completion

If the direction is worthwhile, human-only setup is not by itself a reason to
reject the work.

## Documentation rule

If agents discover durable product learnings, they should update the shared docs
that future product work depends on.
