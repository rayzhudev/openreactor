export type AutomationStatusLevel = "info" | "warning" | "error";
export type AutomationStatusSeverity = "info" | "warning" | "error" | "critical";
export type AutomationStatusHealth = "healthy" | "degraded" | "paused" | "down" | "unknown";

export interface AutomationStatusItemSample {
  itemIds: string[];
  visibleCount: number;
  truncated: boolean;
}

export interface AutomationStatusCounts {
  totalItems?: number;
  queued?: number;
  active?: number;
  blocked?: number;
  completed?: number;
  inTransit?: number;
}

export interface AutomationStatusSystemSnapshot {
  id: string;
  name: string;
  kind: string;
  environment?: string;
  status: AutomationStatusHealth;
}

export type AutomationStatusNodeKind =
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

export interface AutomationStatusWorkflowNode {
  id: string;
  kind: AutomationStatusNodeKind;
  label: string;
  status: AutomationStatusHealth;
  capacity?: {
    maxConcurrency?: number;
    maxQueueDepth?: number;
  };
  counts?: AutomationStatusCounts;
  samples?: {
    items?: AutomationStatusItemSample;
  };
  metadata?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

export type AutomationStatusEdgeKind =
  | "flow"
  | "retry"
  | "handoff"
  | "dependency"
  | "control";

export interface AutomationStatusWorkflowEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: AutomationStatusEdgeKind;
  label?: string;
  status?: AutomationStatusHealth;
  counts?: AutomationStatusCounts;
  samples?: {
    items?: AutomationStatusItemSample;
  };
  metadata?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

export interface AutomationStatusTopologySnapshot {
  nodes: AutomationStatusWorkflowNode[];
  edges: AutomationStatusWorkflowEdge[];
}

export type AutomationStatusWorkItemState =
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

export interface AutomationStatusWorkItem {
  id: string;
  kind: string;
  label: string;
  state: AutomationStatusWorkItemState;
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

export type AutomationStatusActorKind = "agent" | "service" | "human" | "integration";
export type AutomationStatusActorState =
  | "idle"
  | "working"
  | "waiting"
  | "stalled"
  | "failed"
  | "unavailable";

export interface AutomationStatusActorSnapshot {
  id: string;
  kind: AutomationStatusActorKind;
  label: string;
  role?: string;
  status: AutomationStatusActorState;
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

export interface AutomationStatusExecutionSnapshot {
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

export interface AutomationStatusIncidentSnapshot {
  id: string;
  kind: string;
  label: string;
  severity: AutomationStatusSeverity;
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

export interface AutomationStatusServiceSnapshot {
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

export interface AutomationStatusRuntimeSnapshot {
  items: AutomationStatusWorkItem[];
  actors: AutomationStatusActorSnapshot[];
  executions?: AutomationStatusExecutionSnapshot[];
  incidents: AutomationStatusIncidentSnapshot[];
  services: AutomationStatusServiceSnapshot[];
}

export interface AutomationStatusEventSnapshot {
  id: string;
  at: string;
  kind: string;
  level: AutomationStatusLevel;
  subjectType: "system" | "node" | "edge" | "item" | "actor" | "execution" | "incident" | "service";
  subjectId: string;
  message: string;
  metadata?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

export interface AutomationStatusActivitySnapshot {
  recentEvents: AutomationStatusEventSnapshot[];
}

export interface AutomationStatusMetricsSnapshot {
  totals?: Record<string, number>;
  rates?: Record<string, number>;
  durations?: Record<string, number>;
  capacities?: Record<string, number>;
}

export interface OpenReactorStatusPayload {
  specVersion: "automation-status/v1";
  generatedAt: string;
  system: AutomationStatusSystemSnapshot;
  topology: AutomationStatusTopologySnapshot;
  snapshot: AutomationStatusRuntimeSnapshot;
  activity: AutomationStatusActivitySnapshot;
  metrics?: AutomationStatusMetricsSnapshot;
  extensions?: Record<string, unknown>;
}

export interface OpenReactorIntakeSnapshot {
  node: AutomationStatusWorkflowNode;
  items: AutomationStatusWorkItem[];
}

export const OPENREACTOR_NODE_ORDER = [
  "intake",
  "triage-planning",
  "execution",
  "waiting",
  "completed",
  "rejected",
  "watchdog"
] as const;

export const OPENREACTOR_DEFAULT_EDGES: AutomationStatusWorkflowEdge[] = [
  {
    id: "intake-to-triage",
    fromNodeId: "intake",
    toNodeId: "triage-planning",
    kind: "flow",
    status: "unknown"
  },
  {
    id: "triage-to-execution",
    fromNodeId: "triage-planning",
    toNodeId: "execution",
    kind: "flow",
    status: "unknown"
  },
  {
    id: "execution-to-retry",
    fromNodeId: "execution",
    toNodeId: "execution",
    kind: "retry",
    status: "unknown"
  },
  {
    id: "execution-to-waiting",
    fromNodeId: "execution",
    toNodeId: "waiting",
    kind: "handoff",
    status: "unknown"
  },
  {
    id: "execution-to-completed",
    fromNodeId: "execution",
    toNodeId: "completed",
    kind: "flow",
    status: "unknown"
  },
  {
    id: "triage-to-rejected",
    fromNodeId: "triage-planning",
    toNodeId: "rejected",
    kind: "flow",
    status: "unknown"
  },
  {
    id: "triage-to-intake",
    fromNodeId: "triage-planning",
    toNodeId: "intake",
    kind: "handoff",
    status: "unknown"
  },
  {
    id: "watchdog-to-execution",
    fromNodeId: "watchdog",
    toNodeId: "execution",
    kind: "control",
    status: "unknown"
  }
];

export function createOpenReactorIssueItemId(issueNumber: number): string {
  return `openreactor:issue:${issueNumber}`;
}

export function buildUnavailableNode(input: {
  id: string;
  label: string;
  kind: AutomationStatusNodeKind;
  error?: string;
}): AutomationStatusWorkflowNode {
  return {
    id: input.id,
    label: input.label,
    kind: input.kind,
    status: "unknown",
    counts: {
      totalItems: 0
    },
    samples: {
      items: {
        itemIds: [],
        visibleCount: 0,
        truncated: false
      }
    },
    metadata: input.error ? { error: input.error } : {}
  };
}

export function mergeOpenReactorStatusPayload(
  localStatus: OpenReactorStatusPayload | null,
  intakeSnapshot: OpenReactorIntakeSnapshot,
  localError = ""
): OpenReactorStatusPayload {
  const baseStatus = localStatus ?? buildFallbackOpenReactorStatus(intakeSnapshot, localError);
  const nodeMap = new Map(
    (baseStatus.topology?.nodes ?? []).map((node) => [node.id, node] as const)
  );
  nodeMap.set(intakeSnapshot.node.id, intakeSnapshot.node);

  const mergedItems = dedupeById([
    ...intakeSnapshot.items,
    ...((baseStatus.snapshot?.items ?? []) as AutomationStatusWorkItem[])
  ]);

  const mergedIncidents = [...(baseStatus.snapshot?.incidents ?? [])];
  if (localError && !mergedIncidents.some((incident) => incident.id === "openreactor:incident:runtime-unavailable")) {
    mergedIncidents.unshift({
      id: "openreactor:incident:runtime-unavailable",
      kind: "runtime-unavailable",
      label: "Live OpenReactor runtime metadata is unavailable.",
      severity: "warning",
      status: "active",
      scope: {
        system: true,
        serviceIds: ["reactor", "watchdog"]
      },
      startedAt: baseStatus.generatedAt,
      reason: localError,
      extensions: {
        openreactor: {
          message: localError
        }
      }
    });
  }

  const extensions = {
    ...(isPlainRecord(baseStatus.extensions) ? baseStatus.extensions : {}),
    openreactor: {
      ...(isPlainRecord(baseStatus.extensions?.openreactor)
        ? (baseStatus.extensions?.openreactor as Record<string, unknown>)
        : {}),
      nodeOrder: [...OPENREACTOR_NODE_ORDER]
    }
  };

  return {
    specVersion: "automation-status/v1",
    generatedAt: baseStatus.generatedAt ?? new Date().toISOString(),
    system: {
      ...baseStatus.system,
      status: mergedIncidents.some((incident) => incident.kind === "runtime-unavailable")
        ? "degraded"
        : baseStatus.system.status
    },
    topology: {
      nodes: orderOpenReactorNodes(Array.from(nodeMap.values())),
      edges: mergeOpenReactorEdges(baseStatus.topology?.edges ?? [])
    },
    snapshot: {
      items: mergedItems,
      actors: baseStatus.snapshot?.actors ?? [],
      executions: baseStatus.snapshot?.executions ?? [],
      incidents: mergedIncidents,
      services: ensureDefaultServices(baseStatus.snapshot?.services ?? [])
    },
    activity: baseStatus.activity ?? {
      recentEvents: []
    },
    metrics: baseStatus.metrics,
    extensions
  };
}

export function buildFallbackOpenReactorStatus(
  intakeSnapshot: OpenReactorIntakeSnapshot,
  localError = "Live OpenReactor runtime metadata is unavailable."
): OpenReactorStatusPayload {
  const generatedAt = new Date().toISOString();
  const fallbackNodes = [
    intakeSnapshot.node,
    buildUnavailableNode({
      id: "triage-planning",
      label: "Triage & planning",
      kind: "processor",
      error: localError
    }),
    buildUnavailableNode({
      id: "execution",
      label: "Execution",
      kind: "processor",
      error: localError
    }),
    buildUnavailableNode({
      id: "waiting",
      label: "Waiting",
      kind: "human-gate",
      error: localError
    }),
    buildUnavailableNode({
      id: "completed",
      label: "Completed",
      kind: "sink",
      error: localError
    }),
    buildUnavailableNode({
      id: "rejected",
      label: "Rejected",
      kind: "sink",
      error: localError
    }),
    buildUnavailableNode({
      id: "watchdog",
      label: "Watchdog",
      kind: "supervisor",
      error: localError
    })
  ];

  return {
    specVersion: "automation-status/v1",
    generatedAt,
    system: {
      id: "openreactor",
      name: "OpenReactor",
      kind: "autonomous-software-delivery",
      status: intakeSnapshot.node.status === "healthy" ? "degraded" : "unknown"
    },
    topology: {
      nodes: orderOpenReactorNodes(fallbackNodes),
      edges: mergeOpenReactorEdges([])
    },
    snapshot: {
      items: intakeSnapshot.items,
      actors: [],
      executions: [],
      incidents: localError
        ? [
            {
              id: "openreactor:incident:runtime-unavailable",
              kind: "runtime-unavailable",
              label: "Live OpenReactor runtime metadata is unavailable.",
              severity: "warning",
              status: "active",
              scope: {
                system: true,
                serviceIds: ["reactor", "watchdog"]
              },
              startedAt: generatedAt,
              reason: localError,
              extensions: {
                openreactor: {
                  message: localError
                }
              }
            }
          ]
        : [],
      services: ensureDefaultServices([])
    },
    activity: {
      recentEvents: []
    },
    metrics: {
      totals: {
        queuedItems: intakeSnapshot.node.counts?.queued ?? 0
      }
    },
    extensions: {
      openreactor: {
        nodeOrder: [...OPENREACTOR_NODE_ORDER]
      }
    }
  };
}

function mergeOpenReactorEdges(
  existingEdges: AutomationStatusWorkflowEdge[]
): AutomationStatusWorkflowEdge[] {
  const edgeMap = new Map(existingEdges.map((edge) => [edge.id, edge] as const));

  for (const edge of OPENREACTOR_DEFAULT_EDGES) {
    if (!edgeMap.has(edge.id)) {
      edgeMap.set(edge.id, edge);
    }
  }

  const ordered = OPENREACTOR_DEFAULT_EDGES.map((edge) => edgeMap.get(edge.id) ?? edge);
  for (const edge of edgeMap.values()) {
    if (!OPENREACTOR_DEFAULT_EDGES.some((candidate) => candidate.id === edge.id)) {
      ordered.push(edge);
    }
  }

  return ordered;
}

function ensureDefaultServices(
  services: AutomationStatusServiceSnapshot[]
): AutomationStatusServiceSnapshot[] {
  const serviceMap = new Map(services.map((service) => [service.id, service] as const));

  if (!serviceMap.has("reactor")) {
    serviceMap.set("reactor", {
      id: "reactor",
      label: "Reactor",
      status: "unknown",
      active: false
    });
  }

  if (!serviceMap.has("watchdog")) {
    serviceMap.set("watchdog", {
      id: "watchdog",
      label: "Watchdog",
      status: "unknown",
      active: false
    });
  }

  return Array.from(serviceMap.values());
}

function orderOpenReactorNodes(
  nodes: AutomationStatusWorkflowNode[]
): AutomationStatusWorkflowNode[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));
  const ordered: AutomationStatusWorkflowNode[] = [];

  for (const id of OPENREACTOR_NODE_ORDER) {
    const node = nodeMap.get(id);
    if (node) {
      ordered.push(node);
      nodeMap.delete(id);
    }
  }

  return [...ordered, ...nodeMap.values()];
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
