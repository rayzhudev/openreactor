# Automation Status Spec

Version: `automation-status/v1-draft`

Machine-readable artifacts:

- [AUTOMATION_STATUS_SCHEMA.json](/Users/ray/Projects/openreactor/AUTOMATION_STATUS_SCHEMA.json)
- [AUTOMATION_STATUS_EXAMPLE.json](/Users/ray/Projects/openreactor/AUTOMATION_STATUS_EXAMPLE.json)

## Purpose

This spec defines a generic observability contract for autonomous systems.

It is intended to work across systems such as:

- coding-agent workflows,
- marketing automation pipelines,
- research agents,
- support triage systems,
- multi-step human-and-agent workflows,
- other graph-shaped autonomous systems.

The contract should let any consumer understand:

- what parts of the system exist,
- how they connect,
- what work is moving,
- which actors are doing that work,
- where work is blocked,
- what the services are doing,
- what recently happened.

## Non-goals

This spec does not define:

- UI layout,
- node positions,
- viewport hints,
- colors,
- shapes,
- renderer-specific concepts such as belts, bins, bays, or sprites.

Those belong to renderers such as `@openreactor/factory-floor`, not to the
status contract itself.

## Design principles

### 1. Graph-first, not pipeline-first

The primary model is a workflow graph:

- `nodes` describe operational places in the system,
- `edges` describe allowed movement or control relationships,
- the current snapshot describes where items, actors, incidents, and services
  are now.

This is more general than a left-to-right pipeline and can represent branching,
retry loops, control flows, human gates, and disconnected subsystems.

### 2. Operational truth, not presentation hints

The payload should expose runtime truth only.

It must not contain:

- pixel positions,
- grid coordinates,
- renderer-selected groups,
- visual priority hints,
- theme tokens.

### 3. Accurate totals plus bounded samples

Whenever the payload samples items for size reasons, it must also expose the
real totals.

Consumers must never have to guess whether a list is complete.

### 4. Typed core, extensible details

The core schema should stay generic.
System-specific data belongs in namespaced extensions.

### 5. Snapshot plus recent activity

A useful observability contract needs both:

- the latest state snapshot,
- a recent event stream explaining how the system reached that state.

## Top-level shape

```ts
interface AutomationStatusSnapshot {
  specVersion: "automation-status/v1";
  generatedAt: string;
  system: SystemSnapshot;
  topology: TopologySnapshot;
  snapshot: RuntimeSnapshot;
  activity: ActivitySnapshot;
  metrics?: MetricsSnapshot;
  extensions?: Record<string, unknown>;
}
```

## Core entities

### System

Represents the observed autonomous system.

```ts
interface SystemSnapshot {
  id: string;
  name: string;
  kind: string;
  environment?: string;
  status: "healthy" | "degraded" | "paused" | "down" | "unknown";
}
```

### Topology

Describes the workflow graph independently of the current runtime state.

```ts
interface TopologySnapshot {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
```

### Node

A node is a place in the workflow graph.

Examples:

- a source integration,
- a queue,
- a processing stage,
- a human approval gate,
- a supervisor,
- a terminal sink.

```ts
type WorkflowNodeKind =
  | "source"
  | "queue"
  | "processor"
  | "router"
  | "sink"
  | "store"
  | "supervisor"
  | "scheduler"
  | "integration"
  | "human-gate";

interface WorkflowNode {
  id: string;
  kind: WorkflowNodeKind;
  label: string;
  status: "healthy" | "degraded" | "paused" | "down" | "unknown";
  capacity?: {
    maxConcurrency?: number;
    maxQueueDepth?: number;
  };
  counts?: {
    totalItems?: number;
    queued?: number;
    active?: number;
    blocked?: number;
    completed?: number;
  };
  samples?: {
    items?: ItemSample;
  };
  metadata?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}
```

### Edge

An edge connects two nodes.

```ts
type WorkflowEdgeKind =
  | "flow"
  | "retry"
  | "handoff"
  | "dependency"
  | "control";

interface WorkflowEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: WorkflowEdgeKind;
  label?: string;
  status?: "healthy" | "degraded" | "paused" | "down" | "unknown";
  counts?: {
    totalItems?: number;
    queued?: number;
    inTransit?: number;
  };
  samples?: {
    items?: ItemSample;
  };
  metadata?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}
```

```ts
interface ItemSample {
  itemIds: string[];
  visibleCount: number;
  truncated: boolean;
}
```

### Runtime snapshot

Represents the system state at one point in time.

```ts
interface RuntimeSnapshot {
  items: WorkItem[];
  actors: ActorSnapshot[];
  executions?: ExecutionSnapshot[];
  incidents: IncidentSnapshot[];
  services: ServiceSnapshot[];
}
```

### Item

A work item is a unit of work moving through the system.

```ts
type WorkItemState =
  | "queued"
  | "assigned"
  | "running"
  | "waiting"
  | "blocked"
  | "retrying"
  | "paused"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "deferred";

interface WorkItem {
  id: string;
  kind: string;
  label: string;
  state: WorkItemState;
  currentNodeId?: string;
  currentEdgeId?: string;
  assignedActorId?: string | null;
  createdAt?: string;
  enteredStateAt?: string;
  updatedAt?: string;
  priority?: string;
  retryCount?: number;
  outcome?: string;
  blockedByIncidentIds?: string[];
  relatedResourceUrls?: string[];
  metadata?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}
```

### Actor

An actor performs or supervises work.

```ts
type ActorKind = "agent" | "service" | "human" | "integration";

interface ActorSnapshot {
  id: string;
  kind: ActorKind;
  label: string;
  role?: string;
  status: "idle" | "working" | "waiting" | "stalled" | "failed" | "unavailable";
  currentNodeId?: string;
  currentExecutionId?: string | null;
  currentItemId?: string | null;
  provider?: string;
  model?: string;
  capabilities?: string[];
  startedAt?: string;
  lastHeartbeatAt?: string;
  metadata?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}
```

### Execution

An execution is one attempt by an actor to process a work item.

```ts
interface ExecutionSnapshot {
  id: string;
  itemId: string;
  actorId: string;
  nodeId: string;
  status: "running" | "waiting" | "succeeded" | "failed" | "cancelled";
  attempt?: number;
  startedAt: string;
  updatedAt?: string;
  completedAt?: string;
  outcome?: string;
  summary?: string | null;
  metadata?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}
```

### Incident

An incident describes a problem or degraded condition affecting part of the
system.

```ts
type IncidentSeverity = "info" | "warning" | "error" | "critical";

interface IncidentSnapshot {
  id: string;
  kind: string;
  label: string;
  severity: IncidentSeverity;
  status: "active" | "monitoring" | "resolved";
  scope: {
    system?: boolean;
    nodeIds?: string[];
    edgeIds?: string[];
    itemIds?: string[];
    actorIds?: string[];
    serviceIds?: string[];
  };
  startedAt: string;
  updatedAt?: string;
  resolvedAt?: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}
```

### Service

A service represents runtime or infrastructure health.

```ts
interface ServiceSnapshot {
  id: string;
  label: string;
  status: "healthy" | "degraded" | "down" | "cooldown" | "paused" | "unknown";
  active: boolean;
  updatedAt?: string | null;
  restarts?: number;
  cooldownUntil?: string | null;
  metadata?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}
```

### Activity

Recent immutable events help explain state transitions.

```ts
interface ActivitySnapshot {
  recentEvents: EventSnapshot[];
}

interface EventSnapshot {
  id: string;
  at: string;
  kind: string;
  level: "info" | "warning" | "error";
  subjectType: "system" | "node" | "edge" | "item" | "actor" | "execution" | "incident" | "service";
  subjectId: string;
  message: string;
  metadata?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}
```

### Metrics

Metrics are optional summary fields for dashboards and trend surfaces.

```ts
interface MetricsSnapshot {
  totals?: Record<string, number>;
  rates?: Record<string, number>;
  durations?: Record<string, number>;
  capacities?: Record<string, number>;
}
```

## Required semantic rules

### Location semantics

Each `WorkItem` should identify its current location with exactly one of:

- `currentNodeId`, or
- `currentEdgeId`.

Consumers should not need to infer whether the item is waiting at a node or
moving between nodes.

### Sample semantics

If a producer caps returned lists for payload size, it must expose explicit
sampling data on the containing object, for example:

```ts
{
  counts: { totalItems: 124, queued: 124 },
  samples: {
    items: {
      itemIds: ["item-1", "item-2", "item-3"],
      visibleCount: 3,
      truncated: true
    }
  }
}
```

The core rule is:

- counts represent truth,
- samples represent preview,
- previews must never pretend to be full lists.

### Status semantics

Producers should use consistent meanings:

- `healthy`: operating normally
- `degraded`: operating but impaired
- `paused`: intentionally stopped or gated
- `down`: unavailable or broken
- `unknown`: no reliable signal

### Time semantics

All timestamps must be ISO 8601 UTC strings.

### Extension semantics

Extensions should be namespaced by producer or domain, for example:

```ts
extensions: {
  openreactor: {
    githubIssueNumber: 42,
    evidenceStrength: "moderate"
  }
}
```

Core fields should remain portable across systems.

## OpenReactor mapping

OpenReactor can map into this generic model without changing the standard
itself.

### Topology

- GitHub intake: node kind `source`
- Triage and planning: node kind `processor`
- Execution: node kind `processor`
- Retry queue or retry path: node kind `queue` or edge kind `retry`
- Blocked or maintainer handoff areas: represented through item state and
  incidents rather than a required special primitive
- Completed outcomes: node kind `sink`
- Watchdog: service plus optional node kind `supervisor`

### Actors

- planning agents: actor kind `agent`, role `planning`
- implementation agents: actor kind `agent`, role `general` or `ui`
- watchdog runtime: actor kind `service` only if exposed as an actor is useful

### Incidents

- provider outage,
- paused issue escalation,
- maintainer handoff,
- stale heartbeat,
- service cooldown,
- service failure.

### Extensions

OpenReactor-specific details can live in `extensions.openreactor`, such as:

- GitHub issue numbers,
- PR URLs,
- evidence strength,
- sensitivity,
- tool labels,
- provider labels,
- reasoning effort.

## Open questions for implementation

- Should `executions` be mandatory or optional in the first shipped version?
- Should `counts` be duplicated onto both nodes and edges when producers can
  compute them cheaply?
- Should the spec include an optional `schemaUrl` field for remote validation?
- How much event retention should the status endpoint expose directly versus
  leaving to a separate timeline endpoint?

## Initial adoption guidance for OpenReactor

For OpenReactor, the first migration target should be:

1. keep the existing status endpoint,
2. replace loose `Record<string, unknown>` payload fragments with typed shapes,
3. move from stage-array-first thinking toward graph-plus-snapshot thinking,
4. expose real counts separately from sampled item lists,
5. add explicit incident and outage data where the runtime already knows it,
6. let renderers consume this contract without adding presentation data to it.
