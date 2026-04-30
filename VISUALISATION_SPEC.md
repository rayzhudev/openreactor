# OpenReactor Visualisation Spec

This document now points to the two specs that replace the original combined
visualisation draft.

## Current split

- [AUTOMATION_STATUS_SPEC.md](/Users/ray/Projects/openreactor/AUTOMATION_STATUS_SPEC.md)
  defines the generic, renderer-agnostic observability contract for autonomous
  systems.
- [OPENREACTOR_AUTOMATION_STATUS_MAPPING.md](/Users/ray/Projects/openreactor/OPENREACTOR_AUTOMATION_STATUS_MAPPING.md)
  defines how OpenReactor maps its current runtime concepts into that generic
  contract.
- [FACTORY_FLOOR_SPEC.md](/Users/ray/Projects/openreactor/FACTORY_FLOOR_SPEC.md)
  defines the `@openreactor/factory-floor` renderer that consumes that
  contract.

## Why the split exists

The original draft mixed two separate concerns:

1. the status API for an autonomous system,
2. the specific factory-floor UI used to render that system.

That coupling would have made the API too specific to one visualization and too
specific to OpenReactor's current workflow shape.

The new boundary is:

- the API describes operational truth,
- the renderer decides how to visualize that truth.

## Migration intent

- The generic automation-status spec should become the foundation for the
  OpenReactor status service over time.
- `@openreactor/factory-floor` is the website visualization renderer. The
  static site consumes the local workspace package artifact copied into
  `public/factory-floor/`.
