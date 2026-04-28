# OpenReactor Automation Status Mapping

This document maps the generic
[AUTOMATION_STATUS_SPEC.md](/Users/ray/Projects/openreactor/AUTOMATION_STATUS_SPEC.md)
to OpenReactor's current workflow.

It exists to answer two questions precisely:

1. how OpenReactor should publish its own runtime data through the generic
   automation-status standard,
2. which OpenReactor-specific details should stay in `extensions.openreactor`
   instead of becoming part of the shared standard.

## System

```ts
system = {
  id: "openreactor",
  name: "OpenReactor",
  kind: "autonomous-software-delivery"
}
```

## Topology mapping

### Nodes

| OpenReactor concept | Standard node id | Node kind |
|---|---|---|
| GitHub-backed intake queue | `intake` | `source` |
| Triage and planning work | `triage-planning` | `processor` |
| Active implementation work | `execution` | `processor` |
| Pending retries | `retry` | `queue` |
| Paused work and maintainer handoffs | `blocked` | `queue` |
| Terminal outcomes | `completed` | `sink` |
| Watchdog supervisor | `watchdog` | `supervisor` |

### Edges

| OpenReactor flow | Edge kind |
|---|---|
| intake -> triage-planning | `flow` |
| triage-planning -> execution | `flow` |
| execution -> retry | `retry` |
| retry -> execution | `retry` |
| execution -> blocked | `handoff` |
| execution -> completed | `flow` |
| watchdog -> blocked | `control` |

## Work item mapping

OpenReactor publishes one primary work item per GitHub issue.

### Work item id

```ts
id = `openreactor:issue:${issueNumber}`
```

### Work item kind

- `issue`

### Work item state mapping

| OpenReactor status | Standard state | Notes |
|---|---|---|
| queued intake request | `queued` | `currentNodeId = "intake"` |
| active planning run | `running` | `currentNodeId = "triage-planning"` |
| active implementation run | `running` | `currentNodeId = "execution"` |
| retry | `retrying` | `currentNodeId = "retry"` |
| failed retry attempt | `failed` | still usually `currentNodeId = "retry"` |
| paused | `paused` | `currentNodeId = "blocked"` |
| waiting-maintainer | `waiting` | `currentNodeId = "blocked"` |
| accepted | `succeeded` + `outcome = "accepted"` | `currentNodeId = "completed"` |
| rejected | `succeeded` + `outcome = "rejected"` | terminal product decision, not system failure |
| decomposed | `succeeded` + `outcome = "decomposed"` | terminal outcome for the parent issue |

## Actor mapping

OpenReactor active agents publish as actors.

### Actor kind

- `agent`

### Actor role mapping

| OpenReactor primary use | Standard role |
|---|---|
| planning | `planning` |
| general | `general` |
| ui | `ui` |

### Actor status mapping

| OpenReactor actor status | Standard status |
|---|---|
| running | `working` |
| waiting | `waiting` |
| stalled | `stalled` |
| failed | `failed` |
| provider-unavailable | `unavailable` |

## Incident mapping

OpenReactor uses incidents for blocked or degraded states that should be
operator-visible.

### Current incident kinds

| OpenReactor condition | Standard incident kind | Scope |
|---|---|---|
| paused issue | `paused-issue` | blocked node + item |
| maintainer handoff | `maintainer-handoff` | blocked node + item |
| reactor service degraded or down | `service-degraded` | reactor service |
| watchdog service degraded or down | `service-degraded` | watchdog service |
| runtime metadata unavailable at website proxy | `runtime-unavailable` | system + services |

### Planned incident kinds

These are not fully exposed yet, but the standard should support them:

- `provider-outage`
- `stale-heartbeat`
- `rate-limit-cooldown`
- `repair-in-progress`

## Service mapping

| OpenReactor service | Standard service id |
|---|---|
| reactor | `reactor` |
| watchdog | `watchdog` |

Current service details that remain OpenReactor-specific live in
`extensions.openreactor`, including:

- `activeState`
- `subState`
- `result`
- `execMainPid`
- `snapshotFresh`
- `snapshotGeneratedAt`
- `lastServiceFailureClass`
- `lastServiceActionAt`

## Event mapping

OpenReactor recent runtime events map directly into `activity.recentEvents`.

### Generic fields

- `kind`
- `level`
- `at`
- `message`
- `subjectType`
- `subjectId`

### OpenReactor-specific event fields

These stay in `extensions.openreactor`:

- `title`
- `issueNumber`
- `iteration`

## OpenReactor extensions

The following details should remain in `extensions.openreactor` rather than the
shared standard:

- GitHub issue number and issue URL
- GitHub PR URL
- branch name
- tool name and tool label
- provider label
- reasoning effort
- service tier
- sensitivity
- evidence strength
- transcript preview
- support count and comment count
- repair issue references

## Counts and samples

OpenReactor should publish:

- truthful total counts on nodes,
- bounded visible sample item ids on nodes,
- full item objects only for sampled items returned in the payload.

The current website UI can then show both:

- operational totals,
- recent visible examples.

## Executions

OpenReactor now maps execution metadata into `snapshot.executions`.

### Active runs

Active runs publish a running execution snapshot with:

- `itemId` pointing at the current GitHub issue item,
- `actorId` pointing at the current agent actor,
- `nodeId` of `triage-planning` or `execution`,
- OpenReactor-specific tool and provider metadata in `extensions.openreactor`.

### Historical run metadata

When a run record contains triage or implementation execution metadata,
OpenReactor may also publish historical execution snapshots for:

- triage work,
- completed implementation work,
- retry attempts.

This keeps provider/model/tool metadata available at the execution layer rather
than forcing consumers to infer it only from items or actors.

## Current implementation note

The repo now emits the generic top-level shape and uses `extensions.openreactor`
to carry OpenReactor-specific detail.

The public website still normalizes that generic payload into its current
OpenReactor-specific UI state until `@openreactor/factory-floor` replaces the
legacy visualization code.
