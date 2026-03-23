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
- When one issue bundles multiple asks, do not treat that as an automatic
  all-or-nothing rejection. Separate the asks, preserve the worthwhile subset,
  and reject or bank only the parts that truly fail product judgment.
- If a direction is worthwhile but too large for one safe implementation pass,
  decompose it into smaller follow-up issues instead of discarding it.
- Do not reject a direction solely because it requires difficult backend work.
  If the managed product's core promise depends on collecting, ingesting,
  scraping, normalizing, or reconciling external data, then those integration
  requests are first-class product work, not automatic scope violations.
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

## Core site and playground

OpenReactor is one product, but not every surface of that product should move
the same way.

- The homepage, intake flow, sign-in experience, primary navigation, and other
  core public surfaces should stay more coherent and directionally focused.
- `/playground/` is the intentionally loose surface. It is where OpenReactor
  can absorb weird, prankish, memetic, chaotic, absurd, or obviously unserious
  ideas that would be too disruptive for the main product flow.
- The playground exists to make OpenReactor feel alive, surprising, viral, and
  highly community-shaped. It is allowed to diverge sharply from the rest of
  the site in visuals, tone, and behavior.
- The playground does not need to explicitly self-disclose every prank, parody,
  fake sponsorship, or absurd interaction. The surface as a whole may be
  understood as intentionally playful and not bound by the same seriousness as
  the homepage.
- The playground should still remain navigable and preserve a clear path back
  to the homepage.
- The playground should not become pure noise. Additions should still create
  delight, spectacle, interaction, novelty, or the sense that the surface is
  alive.
- If a request is not a good fit for the homepage or core flow, agents should
  prefer routing it to `/playground/` over rejecting it when it is still
  harmless and implementable.

## Sensitivity and evidence

The product should not treat every surface as equally easy to change.

- Homepage identity, brand voice, core UX framing, and other central public
  experiences are higher-sensitivity surfaces.
- Shared UI patterns, navigation, and important product flows are medium
  sensitivity.
- `/playground/`, side pages, isolated experiments, and narrow reversible
  features are lower sensitivity by default.

Lower-sensitivity changes can move on one strong request. Higher-sensitivity
changes should usually need stronger evidence, maintainer steering, or repeated
supporting feedback before they are acted on.

If a request looks worthwhile but should not be acted on yet, agents should
bank it for later instead of rejecting it prematurely.

If the underlying direction is sound but the exact requested threshold is too
absolute, agents should usually keep the product signal and soften the literal
constraint. For example, a request for an unrealistically tiny asset budget may
still justify reducing obvious bloat or tightening the most wasteful surface.

For `/playground/`, do not reject a request solely because it is prankish,
absurd, memetic, fake, or obviously unserious. Reject it only when it crosses
the repo's hard safety boundaries, destroys site usability, or is not a real
implementable task.

## Maintainer steering

If a trusted issue signal marks the request as maintainer steering, agents
should treat it as maintainer steering. Trusted signals include:

- the real GitHub issue author matching the repository owner
- the `maintainer-steered` label applied by trusted OpenReactor intake or
  decomposition flows

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
- `/playground/`
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

If a governance, triage, merge-policy, or prompt change would benefit more than
one managed repo, implement and document it in the root OpenReactor engine repo
instead of leaving it only in a single managed product repo.
