// ── automation-status/v1 types (consumed, not owned) ────────────────────────

export type HealthStatus = "healthy" | "degraded" | "paused" | "down" | "unknown";
export type Severity = "info" | "warning" | "error" | "critical";

export type NodeKind =
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

export type EdgeKind = "flow" | "retry" | "handoff" | "dependency" | "control";

export type ItemState =
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

export type ActorKind = "agent" | "service" | "human" | "integration";
export type ActorStatus = "idle" | "working" | "waiting" | "stalled" | "failed" | "unavailable";

export interface ItemSample {
  itemIds: string[];
  visibleCount: number;
  truncated: boolean;
}

export interface WorkflowNode {
  id: string;
  kind: NodeKind;
  label: string;
  status: HealthStatus;
  capacity?: { maxConcurrency?: number; maxQueueDepth?: number };
  counts?: {
    totalItems?: number;
    queued?: number;
    active?: number;
    blocked?: number;
    completed?: number;
    inTransit?: number;
  };
  samples?: { items?: ItemSample };
  metadata?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: EdgeKind;
  label?: string;
  status?: HealthStatus;
  counts?: { totalItems?: number; inTransit?: number };
  samples?: { items?: ItemSample };
  metadata?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

export interface WorkItem {
  id: string;
  kind: string;
  label: string;
  state: ItemState;
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

export interface ActorSnapshot {
  id: string;
  kind: ActorKind;
  label: string;
  role?: string;
  status: ActorStatus;
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

export interface ExecutionSnapshot {
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

export interface IncidentSnapshot {
  id: string;
  kind: string;
  label: string;
  severity: Severity;
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

export interface ServiceSnapshot {
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

export interface AutomationStatusPayload {
  specVersion: "automation-status/v1";
  generatedAt: string;
  system: {
    id: string;
    name: string;
    kind: string;
    environment?: string;
    status: HealthStatus;
  };
  topology: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  };
  snapshot: {
    items: WorkItem[];
    actors: ActorSnapshot[];
    executions?: ExecutionSnapshot[];
    incidents: IncidentSnapshot[];
    services: ServiceSnapshot[];
  };
  activity: {
    recentEvents: Array<{
      id: string;
      at: string;
      kind: string;
      level: "info" | "warning" | "error";
      subjectType: string;
      subjectId: string;
      message: string;
      metadata?: Record<string, unknown>;
      extensions?: Record<string, unknown>;
    }>;
  };
  metrics?: {
    totals?: Record<string, number>;
    rates?: Record<string, number>;
    durations?: Record<string, number>;
    capacities?: Record<string, number>;
  };
  extensions?: Record<string, unknown>;
}

// ── Internal renderer state ─────────────────────────────────────────────────

export interface GridPos {
  gx: number;
  gy: number;
}

export interface GridRect extends GridPos {
  gw: number;
  gh: number;
}

export interface LayoutNode extends GridRect {
  id: string;
  kind: NodeKind;
  label: string;
  status: HealthStatus;
  node: WorkflowNode;
}

export interface LayoutEdge {
  id: string;
  kind: EdgeKind;
  from: string;
  to: string;
  status: HealthStatus;
  edge: WorkflowEdge;
}

export interface FloorState {
  nodes: Map<string, LayoutNode>;
  edges: Map<string, LayoutEdge>;
  items: Map<string, WorkItem>;
  actors: Map<string, ActorSnapshot>;
  executions: Map<string, ExecutionSnapshot>;
  incidents: Map<string, IncidentSnapshot>;
  services: Map<string, ServiceSnapshot>;
}

export interface FloorConfig {
  cellSize: number;
  panEnabled: boolean;
  zoomEnabled: boolean;
  zoomMin: number;
  zoomMax: number;
  originX: number;
  originY: number;
  gridVisible: boolean;
  muted: boolean;
}

export const DEFAULT_CONFIG: FloorConfig = {
  cellSize: 25,
  panEnabled: true,
  zoomEnabled: true,
  zoomMin: 0.25,
  zoomMax: 4,
  originX: 0,
  originY: 0,
  gridVisible: true,
  muted: true,
};
