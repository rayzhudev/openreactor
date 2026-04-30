import fs from "node:fs/promises";
import path from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  createOpenReactorIssueItemId,
  type AutomationStatusActorSnapshot,
  type AutomationStatusCounts,
  type AutomationStatusExecutionSnapshot,
  type AutomationStatusEventSnapshot,
  type AutomationStatusIncidentSnapshot,
  type AutomationStatusServiceSnapshot,
  type AutomationStatusWorkItem,
  type AutomationStatusWorkflowEdge,
  type AutomationStatusWorkflowNode,
  type OpenReactorStatusPayload
} from "../packages/contracts/src/openreactor-status";
import { loadConfig as loadReactorConfig } from "../reactor/config";
import { GitHubClient, type GitHubIssue } from "../reactor/github";
import {
  getOpenReactorStatusPaths,
  readReactorLiveSnapshot,
  type ReactorLiveSnapshot
} from "../reactor/live-status";
import {
  readRecentActivityAcrossRuns,
  readRecentTranscriptEntries
} from "../reactor/runtime-artifacts";
import {
  isServiceActive,
  loadOpenReactorStatusConfig,
  readServiceStatus,
  type ServiceStatus
} from "./config";

interface WatchdogStateFile {
  updatedAt?: string;
  serviceCooldownUntil?: string;
  lastServiceFailureClass?: string;
  lastServiceActionAt?: string;
  issues?: Record<
    string,
    {
      autoHealAttempts?: number;
      lastAutoHealAt?: string;
      lastEscalatedAt?: string;
      lastFailureClass?: string;
      repairIssueNumber?: number;
    }
  >;
}

interface RunRecordSummary {
  issueNumber: number;
  issueTitle: string;
  branchName: string;
  status: string;
  updatedAt: string;
  lastHeartbeatAt: string;
  lastError: string;
  lastResult: {
    outcome?: string;
    summary?: string | null;
    prUrl?: string | null;
    humanHandoff?: {
      required: boolean;
      instructions: string;
    } | null;
  } | null;
  triageExecution?: ExecutionSummary | null;
  lastAgentExecution?: ExecutionSummary | null;
}

interface ExecutionSummary {
  stage?: string | null;
  providerKey?: string | null;
  providerLabel?: string | null;
  model?: string | null;
  reasoningEffort?: string | null;
  serviceTier?: string | null;
  toolName?: string | null;
  toolLabel?: string | null;
  primaryUse?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
}

const MAX_STAGE_ITEMS = 8;

const reactorConfig = loadReactorConfig();
const statusConfig = loadOpenReactorStatusConfig();
const github = new GitHubClient(reactorConfig);

async function main(): Promise<void> {
  const server = createServer((request, response) => {
    void handleRequest(request, response);
  });

  server.listen(statusConfig.port, statusConfig.bindHost, () => {
    console.log(
      `OpenReactor status service listening on http://${statusConfig.bindHost}:${statusConfig.port}`
    );
  });

  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    if (!isAuthorized(request)) {
      writeJson(response, 401, {
        ok: false,
        error: "Unauthorized."
      });
      return;
    }

    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname === "/health") {
      writeJson(response, 200, { ok: true });
      return;
    }

    if (pathname !== "/" && pathname !== "/status") {
      writeJson(response, 404, {
        ok: false,
        error: "Not found."
      });
      return;
    }

    const payload = await buildStatusPayload();
    writeJson(response, 200, payload);
  } catch (error) {
    writeJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to build OpenReactor status payload."
    });
  }
}

async function buildStatusPayload(): Promise<OpenReactorStatusPayload> {
  const reactorSnapshot = await readReactorLiveSnapshot(reactorConfig.repoRoot);
  const watchdogState = await readWatchdogState();
  const runRecords = await listRunRecordSummaries();
  const activeActors = await hydrateActiveAgents(reactorSnapshot);
  const recentEvents = (await readRecentActivityAcrossRuns(reactorConfig.runsDir, 12)).map(
    sanitizePublicEvent
  );
  const openIssues = await github.listOpenIssues();
  const openIssueMap = new Map(openIssues.map((issue) => [issue.number, issue] as const));
  const handoffs = await listMaintainerHandoffs(openIssueMap);
  const pausedIssues = listPausedIssues(watchdogState, openIssueMap);
  const reactorService = safeReadServiceStatus(statusConfig.reactorServiceName);
  const watchdogService = safeReadServiceStatus(statusConfig.watchdogServiceName);
  const now = new Date().toISOString();
  const items = buildWorkItems({
    activeActors,
    runRecords,
    pausedIssues,
    maintainerHandoffs: handoffs
  });
  const services = [
    buildServiceSnapshot("reactor", "Reactor", reactorService, reactorSnapshot?.generatedAt ?? null),
    buildServiceSnapshot(
      "watchdog",
      "Watchdog",
      watchdogService,
      watchdogState?.updatedAt ?? null,
      watchdogState
    )
  ];
  const executions = buildExecutionSnapshots({
    activeActors,
    runRecords
  });
  const incidents = buildIncidents({
    generatedAt: now,
    pausedIssues,
    maintainerHandoffs: handoffs,
    services
  });
  const topologyNodes = buildTopologyNodes({
    reactorSnapshot,
    activeActors,
    items,
    incidents,
    services
  });

  return {
    specVersion: "automation-status/v1",
    generatedAt: now,
    system: {
      id: "openreactor",
      name: "OpenReactor",
      kind: "autonomous-software-delivery",
      status: deriveSystemStatus(services, incidents)
    },
    topology: {
      nodes: topologyNodes,
      edges: [
        {
          id: "triage-to-execution",
          fromNodeId: "triage-planning",
          toNodeId: "execution",
          kind: "flow",
          status: "healthy"
        },
        {
          id: "execution-to-retry",
          fromNodeId: "execution",
          toNodeId: "execution",
          kind: "retry",
          status: nodeStatusForEdge(topologyNodes, "execution", "execution")
        },
        {
          id: "execution-to-waiting",
          fromNodeId: "execution",
          toNodeId: "waiting",
          kind: "handoff",
          status: nodeStatusForEdge(topologyNodes, "execution", "waiting")
        },
        {
          id: "execution-to-completed",
          fromNodeId: "execution",
          toNodeId: "completed",
          kind: "flow",
          status: nodeStatusForEdge(topologyNodes, "execution", "completed")
        },
        {
          id: "triage-to-rejected",
          fromNodeId: "triage-planning",
          toNodeId: "rejected",
          kind: "flow",
          status: nodeStatusForEdge(topologyNodes, "triage-planning", "rejected")
        },
        {
          id: "triage-to-intake",
          fromNodeId: "triage-planning",
          toNodeId: "intake",
          kind: "handoff",
          status: "healthy"
        },
        {
          id: "watchdog-to-execution",
          fromNodeId: "watchdog",
          toNodeId: "execution",
          kind: "control",
          status: nodeStatusForEdge(topologyNodes, "watchdog", "execution")
        }
      ]
    },
    snapshot: {
      items,
      actors: activeActors,
      executions,
      incidents,
      services
    },
    activity: {
      recentEvents: recentEvents.map(mapRecentEvent)
    },
    metrics: {
      totals: {
        activeAgents: activeActors.length,
        blockedItems: pausedIssues.length + handoffs.length,
        pendingRetryItems: reactorSnapshot?.reactor.pendingRetryCount ?? 0,
        completedItems: items.filter((item) => item.currentNodeId === "completed").length
      },
      capacities: {
        maxConcurrentIssues:
          reactorSnapshot?.reactor.maxConcurrentIssues ?? reactorConfig.maxConcurrentIssues
      }
    },
    extensions: {
      openreactor: {
        repo: {
          owner: reactorConfig.owner,
          repo: reactorConfig.repo
        },
        nodeOrder: ["intake", "triage-planning", "execution", "waiting", "completed", "rejected", "watchdog"]
      }
    }
  };
}

async function hydrateActiveAgents(
  reactorSnapshot: ReactorLiveSnapshot | null
): Promise<AutomationStatusActorSnapshot[]> {
  const activeAgents = reactorSnapshot?.activeAgents ?? [];

  return Promise.all(
    activeAgents.map(async (agent) => {
      const itemId = createOpenReactorIssueItemId(agent.issueNumber);
      const transcriptPreview = (await readRecentTranscriptEntries(agent.runDir, 6)).map(
        sanitizePublicTranscriptEntry
      );

      return {
        id: `openreactor:actor:${agent.issueNumber}`,
        kind: "agent",
        label: agent.toolLabel,
        role: agent.primaryUse,
        status: mapAgentStatus(agent.status),
        currentNodeId: agent.primaryUse === "planning" ? "triage-planning" : "execution",
        currentItemId: itemId,
        provider: agent.provider,
        model: typeof agent.model === "string" ? agent.model : undefined,
        capabilities: [agent.toolName],
        startedAt: agent.startedAt,
        lastHeartbeatAt: agent.lastHeartbeatAt,
        metadata: {
          updatedAt: agent.updatedAt
        },
        extensions: {
          openreactor: {
            issueNumber: agent.issueNumber,
            issueTitle: agent.issueTitle,
            issueUrl: agent.issueUrl,
            branchName: agent.branchName,
            iteration: agent.iteration,
            targetSurface: agent.targetSurface,
            toolName: agent.toolName,
            toolLabel: agent.toolLabel,
            providerLabel: typeof agent.providerLabel === "string" ? agent.providerLabel : null,
            reasoningEffort:
              typeof agent.reasoningEffort === "string" ? agent.reasoningEffort : null,
            serviceTier: typeof agent.serviceTier === "string" ? agent.serviceTier : null,
            primaryUse: agent.primaryUse,
            sensitivity: agent.sensitivity,
            evidenceStrength: agent.evidenceStrength,
            updatedAt: agent.updatedAt,
            rawStatus: agent.status,
            summary: typeof agent.summary === "string" ? sanitizePublicText(agent.summary, 220) : null,
            transcriptPreview
          }
        }
      };
    })
  );
}

function sanitizePublicEvent(event: Record<string, unknown>): Record<string, unknown> {
  return {
    id: event.id,
    at: event.at,
    issueNumber: event.issueNumber,
    iteration: event.iteration,
    kind: event.kind,
    level: event.level,
    title: sanitizePublicText(typeof event.title === "string" ? event.title : ""),
    message: sanitizePublicText(typeof event.message === "string" ? event.message : "")
  };
}

function sanitizePublicTranscriptEntry(entry: Record<string, unknown>): Record<string, unknown> {
  return {
    id: entry.id,
    at: entry.at,
    issueNumber: entry.issueNumber,
    iteration: entry.iteration,
    stream: entry.stream,
    provider: entry.provider,
    toolName: entry.toolName,
    text: sanitizePublicText(typeof entry.text === "string" ? entry.text : "", 240)
  };
}

function sanitizePublicText(value: string, maxLength = 320): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  const redacted = collapsed
    .replace(/gh[pousr]_[A-Za-z0-9_]+/g, "[redacted-token]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted-token]")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[redacted-token]")
    .replace(/\b(AWS|GITHUB|OPENAI|CLOUDFLARE|TOKEN|SECRET|KEY|PASSWORD)[A-Z0-9_]*=([^\s]+)/gi, "$1=[redacted]")
    .replace(/-----BEGIN [^-]+-----.*?-----END [^-]+-----/g, "[redacted-key]");

  if (redacted.length <= maxLength) {
    return redacted;
  }

  return `${redacted.slice(0, maxLength - 1).trimEnd()}…`;
}

async function listRunRecordSummaries(): Promise<RunRecordSummary[]> {
  const entries = await fs.readdir(reactorConfig.runsDir, { withFileTypes: true }).catch(() => []);
  const records = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("issue-"))
      .map((entry) => readRunRecordSummary(path.join(reactorConfig.runsDir, entry.name, "run.json")))
  );

  return records
    .filter((record): record is RunRecordSummary => Boolean(record))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

async function readWatchdogState(): Promise<WatchdogStateFile | null> {
  const filePath = path.join(reactorConfig.repoRoot, ".openreactor", "watchdog", "state.json");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as WatchdogStateFile;
  } catch {
    return null;
  }
}

async function listMaintainerHandoffs(
  openIssueMap: Map<number, GitHubIssue>
): Promise<
  Array<{
    issueNumber: number;
    issueTitle: string;
    issueUrl: string;
    branchName: string;
    updatedAt: string;
    prUrl: string | null;
    instructions: string;
  }>
> {
  const runsDir = reactorConfig.runsDir;
  const entries = await fs.readdir(runsDir, { withFileTypes: true }).catch(() => []);
  const results: Array<{
    issueNumber: number;
    issueTitle: string;
    issueUrl: string;
    branchName: string;
    updatedAt: string;
    prUrl: string | null;
    instructions: string;
  }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("issue-")) {
      continue;
    }

    const filePath = path.join(runsDir, entry.name, "run.json");
    const record = await readRunRecordSummary(filePath);
    if (!record) {
      continue;
    }

    const issue = openIssueMap.get(record.issueNumber);
    if (!issue || !hasLabel(issue, "maintainer-action-required")) {
      continue;
    }

    const handoff = record.lastResult?.humanHandoff;
    if (record.status !== "waiting-maintainer" && !handoff?.required) {
      continue;
    }

    results.push({
      issueNumber: record.issueNumber,
      issueTitle: record.issueTitle,
      issueUrl: buildIssueUrl(record.issueNumber),
      branchName: record.branchName,
      updatedAt: record.updatedAt,
      prUrl: record.lastResult?.prUrl ?? null,
      instructions: handoff?.instructions?.trim() || "Maintainer action is required before this work can continue."
    });
  }

  return results.sort((left, right) => right.issueNumber - left.issueNumber);
}

async function readRunRecordSummary(filePath: string): Promise<RunRecordSummary | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as RunRecordSummary;
  } catch {
    return null;
  }
}

function listPausedIssues(
  state: WatchdogStateFile | null,
  openIssueMap: Map<number, GitHubIssue>
): Array<Record<string, unknown>> {
  if (!state?.issues) {
    return [];
  }

  return Object.entries(state.issues)
    .filter(([issueNumber, issue]) => {
      if (!issue.lastFailureClass && !issue.repairIssueNumber && !issue.lastEscalatedAt) {
        return false;
      }

      const currentIssue = openIssueMap.get(Number.parseInt(issueNumber, 10));
      return Boolean(currentIssue && hasLabel(currentIssue, reactorConfig.pausedLabel));
    })
    .map(([issueNumber, issue]) => ({
      issueNumber: Number.parseInt(issueNumber, 10),
      issueUrl: buildIssueUrl(Number.parseInt(issueNumber, 10)),
      autoHealAttempts: issue.autoHealAttempts ?? 0,
      lastFailureClass: issue.lastFailureClass ?? null,
      lastAutoHealAt: issue.lastAutoHealAt ?? null,
      lastEscalatedAt: issue.lastEscalatedAt ?? null,
      repairIssueNumber: issue.repairIssueNumber ?? null,
      repairIssueUrl: issue.repairIssueNumber ? buildIssueUrl(issue.repairIssueNumber) : null
    }))
    .sort((left, right) => Number(right.issueNumber) - Number(left.issueNumber));
}

function buildWorkItems(input: {
  activeActors: AutomationStatusActorSnapshot[];
  runRecords: RunRecordSummary[];
  pausedIssues: Array<Record<string, unknown>>;
  maintainerHandoffs: Array<{
    issueNumber: number;
    issueTitle: string;
    issueUrl: string;
    branchName: string;
    updatedAt: string;
    prUrl: string | null;
    instructions: string;
  }>;
}): AutomationStatusWorkItem[] {
  const actorItems = input.activeActors.map((actor) => {
    const details = readOpenReactorExtension(actor.extensions);
    const issueNumber = Number(details.issueNumber);
    return {
      id: createOpenReactorIssueItemId(issueNumber),
      kind: "issue",
      label: String(details.issueTitle ?? `Issue #${issueNumber}`),
      state: "running",
      currentNodeId: actor.currentNodeId,
      assignedActorId: actor.id,
      enteredStateAt: actor.startedAt,
      updatedAt: typeof details.updatedAt === "string" ? details.updatedAt : actor.lastHeartbeatAt,
      relatedResourceUrls: typeof details.issueUrl === "string" ? [details.issueUrl] : [],
      metadata: {
        branchName: details.branchName
      },
      extensions: {
        openreactor: {
          ...details
        }
      }
    } satisfies AutomationStatusWorkItem;
  });

  const retryItems = input.runRecords
    .filter((record) => record.status === "retry" || record.status === "failed")
    .slice(0, MAX_STAGE_ITEMS)
    .map((record) => ({
      id: createOpenReactorIssueItemId(record.issueNumber),
      kind: "issue",
      label: record.issueTitle,
      state: record.status === "failed" ? "failed" : "retrying",
      currentNodeId: "execution",
      enteredStateAt: record.updatedAt,
      updatedAt: record.updatedAt,
      relatedResourceUrls: [buildIssueUrl(record.issueNumber)],
      metadata: {
        branchName: record.branchName
      },
      extensions: {
        openreactor: {
          issueNumber: record.issueNumber,
          issueTitle: record.issueTitle,
          issueUrl: buildIssueUrl(record.issueNumber),
          branchName: record.branchName,
          reason: record.lastError || null,
          lastFailureKind: record.lastError ? "ci-failure" : null,
          rawStatus: record.status,
          updatedAt: record.updatedAt,
          lastHeartbeatAt: record.lastHeartbeatAt
        }
      }
    }));

  const blockedItems = [
    ...input.maintainerHandoffs.map((handoff) => ({
      id: createOpenReactorIssueItemId(handoff.issueNumber),
      kind: "issue",
      label: handoff.issueTitle,
      state: "waiting" as const,
      currentNodeId: "waiting",
      enteredStateAt: handoff.updatedAt,
      updatedAt: handoff.updatedAt,
      relatedResourceUrls: [handoff.issueUrl],
      metadata: {
        branchName: handoff.branchName
      },
      extensions: {
        openreactor: {
          issueNumber: handoff.issueNumber,
          issueTitle: handoff.issueTitle,
          issueUrl: handoff.issueUrl,
          branchName: handoff.branchName,
          prUrl: handoff.prUrl,
          instructions: handoff.instructions,
          blockerKind: "maintainer-handoff"
        }
      }
    })),
    ...input.pausedIssues.map((issue) => {
      const issueNumber = Number(issue.issueNumber);
      return {
        id: createOpenReactorIssueItemId(issueNumber),
        kind: "issue",
        label: `Issue #${issueNumber}`,
        state: "paused" as const,
        currentNodeId: "waiting",
        enteredStateAt:
          typeof issue.lastAutoHealAt === "string"
            ? issue.lastAutoHealAt
            : typeof issue.lastEscalatedAt === "string"
              ? issue.lastEscalatedAt
              : undefined,
        updatedAt:
          typeof issue.lastEscalatedAt === "string"
            ? issue.lastEscalatedAt
            : typeof issue.lastAutoHealAt === "string"
              ? issue.lastAutoHealAt
              : undefined,
        relatedResourceUrls: typeof issue.issueUrl === "string" ? [issue.issueUrl] : [],
        extensions: {
          openreactor: {
            issueNumber,
            issueUrl: typeof issue.issueUrl === "string" ? issue.issueUrl : null,
            autoHealAttempts: Number(issue.autoHealAttempts ?? 0),
            lastFailureClass: typeof issue.lastFailureClass === "string" ? issue.lastFailureClass : null,
            lastAutoHealAt: typeof issue.lastAutoHealAt === "string" ? issue.lastAutoHealAt : null,
            lastEscalatedAt:
              typeof issue.lastEscalatedAt === "string" ? issue.lastEscalatedAt : null,
            repairIssueNumber:
              typeof issue.repairIssueNumber === "number" ? issue.repairIssueNumber : null,
            repairIssueUrl:
              typeof issue.repairIssueUrl === "string" ? issue.repairIssueUrl : null,
            blockerKind: "paused"
          }
        }
      };
    })
  ].slice(0, MAX_STAGE_ITEMS);

  const completedItems = input.runRecords
    .filter((record) => ["accepted", "rejected"].includes(record.status))
    .slice(0, MAX_STAGE_ITEMS)
    .map((record) => ({
      id: createOpenReactorIssueItemId(record.issueNumber),
      kind: record.status === "accepted" && record.lastResult?.prUrl ? "pull-request" : "issue",
      label: record.issueTitle,
      state: record.status === "rejected" ? "failed" as const : "succeeded" as const,
      currentNodeId: record.status === "rejected" ? "rejected" : "completed",
      enteredStateAt: record.lastAgentExecution?.completedAt ?? record.updatedAt,
      updatedAt: record.updatedAt,
      outcome: record.lastResult?.outcome ?? record.status,
      relatedResourceUrls: [
        buildIssueUrl(record.issueNumber),
        ...(record.lastResult?.prUrl ? [record.lastResult.prUrl] : [])
      ],
      metadata: {
        branchName: record.branchName
      },
      extensions: {
        openreactor: {
          issueNumber: record.issueNumber,
          issueTitle: record.issueTitle,
          issueUrl: buildIssueUrl(record.issueNumber),
          artifactKind: record.status === "accepted" && record.lastResult?.prUrl ? "pull-request" : "issue",
          branchName: record.branchName,
          prUrl: record.lastResult?.prUrl ?? null,
          provider: record.lastAgentExecution?.providerKey ?? null,
          providerLabel: record.lastAgentExecution?.providerLabel ?? null,
          toolName: record.lastAgentExecution?.toolName ?? null,
          toolLabel: record.lastAgentExecution?.toolLabel ?? null,
          primaryUse: record.lastAgentExecution?.primaryUse ?? null,
          summary: record.lastResult?.summary ?? null,
          rawStatus: record.status,
          outcome: record.lastResult?.outcome ?? record.status
        }
      }
    }));

  return dedupeItemsById([...actorItems, ...retryItems, ...blockedItems, ...completedItems]);
}

function buildIncidents(input: {
  generatedAt: string;
  pausedIssues: Array<Record<string, unknown>>;
  maintainerHandoffs: Array<{
    issueNumber: number;
    issueTitle: string;
    issueUrl: string;
    branchName: string;
    updatedAt: string;
    prUrl: string | null;
    instructions: string;
  }>;
  services: AutomationStatusServiceSnapshot[];
}): AutomationStatusIncidentSnapshot[] {
  const incidents: AutomationStatusIncidentSnapshot[] = [];

  for (const issue of input.pausedIssues) {
    const issueNumber = Number(issue.issueNumber);
    const failureClass =
      typeof issue.lastFailureClass === "string" ? issue.lastFailureClass : null;
    incidents.push({
      id: `openreactor:incident:paused:${issueNumber}`,
      kind: failureClass === "provider_unavailable" ? "provider-outage" : "paused-issue",
      label: `Issue #${issueNumber} is paused`,
      severity: failureClass === "provider_unavailable" ? "error" : "warning",
      status: "active",
      scope: {
        nodeIds: ["waiting"],
        itemIds: [createOpenReactorIssueItemId(issueNumber)]
      },
      startedAt:
        typeof issue.lastAutoHealAt === "string"
          ? issue.lastAutoHealAt
          : typeof issue.lastEscalatedAt === "string"
            ? issue.lastEscalatedAt
            : input.generatedAt,
      updatedAt: typeof issue.lastEscalatedAt === "string" ? issue.lastEscalatedAt : undefined,
      reason: failureClass,
      extensions: {
        openreactor: {
          issueNumber,
          issueUrl: typeof issue.issueUrl === "string" ? issue.issueUrl : null,
          autoHealAttempts: Number(issue.autoHealAttempts ?? 0),
          lastFailureClass: failureClass,
          repairIssueNumber:
            typeof issue.repairIssueNumber === "number" ? issue.repairIssueNumber : null,
          repairIssueUrl:
            typeof issue.repairIssueUrl === "string" ? issue.repairIssueUrl : null
        }
      }
    });
  }

  for (const handoff of input.maintainerHandoffs) {
    incidents.push({
      id: `openreactor:incident:maintainer-handoff:${handoff.issueNumber}`,
      kind: "maintainer-handoff",
      label: `Issue #${handoff.issueNumber} requires maintainer action`,
      severity: "warning",
      status: "active",
      scope: {
        nodeIds: ["waiting"],
        itemIds: [createOpenReactorIssueItemId(handoff.issueNumber)]
      },
      startedAt: handoff.updatedAt,
      updatedAt: handoff.updatedAt,
      reason: handoff.instructions,
      extensions: {
        openreactor: {
          issueNumber: handoff.issueNumber,
          issueTitle: handoff.issueTitle,
          issueUrl: handoff.issueUrl,
          branchName: handoff.branchName,
          prUrl: handoff.prUrl,
          instructions: handoff.instructions
        }
      }
    });
  }

  for (const service of input.services) {
    if (service.status === "healthy" || service.status === "unknown") {
      continue;
    }

    incidents.push({
      id: `openreactor:incident:service:${service.id}`,
      kind: service.status === "cooldown" ? "service-cooldown" : "service-degraded",
      label: `${service.label} is ${service.status}`,
      severity: service.status === "down" ? "error" : "warning",
      status: "active",
      scope: {
        serviceIds: [service.id],
        nodeIds: service.id === "watchdog" ? ["watchdog"] : ["execution"]
      },
      startedAt: service.updatedAt ?? input.generatedAt,
      updatedAt: service.updatedAt ?? undefined,
      reason:
        typeof service.extensions?.openreactor === "object" &&
        service.extensions.openreactor !== null &&
        typeof (service.extensions.openreactor as Record<string, unknown>).result === "string"
          ? String((service.extensions.openreactor as Record<string, unknown>).result)
          : null
    });
  }

  return incidents;
}

function buildTopologyNodes(input: {
  reactorSnapshot: ReactorLiveSnapshot | null;
  activeActors: AutomationStatusActorSnapshot[];
  items: AutomationStatusWorkItem[];
  incidents: AutomationStatusIncidentSnapshot[];
  services: AutomationStatusServiceSnapshot[];
}): AutomationStatusWorkflowNode[] {
  const itemsByNode = new Map<string, AutomationStatusWorkItem[]>();
  for (const item of input.items) {
    if (!item.currentNodeId) {
      continue;
    }
    const current = itemsByNode.get(item.currentNodeId) ?? [];
    current.push(item);
    itemsByNode.set(item.currentNodeId, current);
  }

  const serviceMap = new Map(input.services.map((service) => [service.id, service] as const));

  return [
    buildNodeSnapshot({
      id: "triage-planning",
      label: "Triage & planning",
      kind: "processor",
      status: deriveNodeStatus("triage-planning", itemsByNode, input.incidents),
      items: itemsByNode.get("triage-planning") ?? []
    }),
    buildNodeSnapshot({
      id: "execution",
      label: "Execution",
      kind: "processor",
      status: deriveNodeStatus("execution", itemsByNode, input.incidents),
      capacity: {
        maxConcurrency:
          input.reactorSnapshot?.reactor.maxConcurrentIssues ?? reactorConfig.maxConcurrentIssues
      },
      items: itemsByNode.get("execution") ?? []
    }),
    buildNodeSnapshot({
      id: "waiting",
      label: "Waiting",
      kind: "human-gate",
      status: deriveNodeStatus("waiting", itemsByNode, input.incidents),
      counts: {
        blocked: (itemsByNode.get("waiting") ?? []).length
      },
      items: itemsByNode.get("waiting") ?? []
    }),
    buildNodeSnapshot({
      id: "completed",
      label: "Completed",
      kind: "sink",
      status: deriveNodeStatus("completed", itemsByNode, input.incidents),
      counts: {
        completed: (itemsByNode.get("completed") ?? []).length
      },
      items: itemsByNode.get("completed") ?? []
    }),
    buildNodeSnapshot({
      id: "rejected",
      label: "Rejected",
      kind: "sink",
      status: deriveNodeStatus("rejected", itemsByNode, input.incidents),
      counts: {
        completed: (itemsByNode.get("rejected") ?? []).length
      },
      items: itemsByNode.get("rejected") ?? []
    }),
    buildNodeSnapshot({
      id: "watchdog",
      label: "Watchdog",
      kind: "supervisor",
      status: mapServiceStatus(serviceMap.get("watchdog")),
      items: []
    })
  ];
}

function buildExecutionSnapshots(input: {
  activeActors: AutomationStatusActorSnapshot[];
  runRecords: RunRecordSummary[];
}): AutomationStatusExecutionSnapshot[] {
  const executions: AutomationStatusExecutionSnapshot[] = [];

  for (const actor of input.activeActors) {
    const details = readOpenReactorExtension(actor.extensions);
    const issueNumber = Number(details.issueNumber);
    const itemId = Number.isFinite(issueNumber)
      ? createOpenReactorIssueItemId(issueNumber)
      : actor.currentItemId ?? actor.id;
    const nodeId = actor.currentNodeId ?? (actor.role === "planning" ? "triage-planning" : "execution");
    const startedAt = typeof actor.startedAt === "string" ? actor.startedAt : new Date().toISOString();

    executions.push({
      id: `openreactor:execution:active:${issueNumber}`,
      itemId,
      actorId: actor.id,
      nodeId,
      status: "running",
      attempt: Number(details.iteration ?? 1),
      startedAt,
      updatedAt: typeof details.updatedAt === "string" ? details.updatedAt : actor.lastHeartbeatAt,
      metadata: {
        provider: actor.provider,
        model: actor.model
      },
      extensions: {
        openreactor: {
          issueNumber,
          toolName: details.toolName ?? null,
          toolLabel: details.toolLabel ?? null,
          providerLabel: details.providerLabel ?? null,
          reasoningEffort: details.reasoningEffort ?? null,
          serviceTier: details.serviceTier ?? null,
          primaryUse: details.primaryUse ?? actor.role ?? null,
          rawStatus: details.rawStatus ?? actor.status
        }
      }
    });
  }

  const seen = new Set(executions.map((execution) => execution.itemId));
  for (const record of input.runRecords) {
    if (seen.has(createOpenReactorIssueItemId(record.issueNumber))) {
      continue;
    }

    if (record.triageExecution?.startedAt) {
      executions.push(buildHistoricalExecutionSnapshot(record, record.triageExecution, "triage-planning"));
    }

    if (record.lastAgentExecution?.startedAt) {
      executions.push(buildHistoricalExecutionSnapshot(record, record.lastAgentExecution, inferExecutionNodeId(record)));
    }
  }

  return executions;
}

function buildHistoricalExecutionSnapshot(
  record: RunRecordSummary,
  execution: ExecutionSummary,
  nodeId: string
): AutomationStatusExecutionSnapshot {
  const completed = typeof execution.completedAt === "string" ? execution.completedAt : undefined;
  const status = completed
    ? record.status === "failed"
      ? "failed"
      : "succeeded"
    : "running";

  return {
    id: `openreactor:execution:${nodeId}:${record.issueNumber}:${execution.startedAt ?? record.updatedAt}`,
    itemId: createOpenReactorIssueItemId(record.issueNumber),
    actorId: `openreactor:actor:${record.issueNumber}`,
    nodeId,
    status,
    attempt: undefined,
    startedAt: execution.startedAt ?? record.updatedAt,
    updatedAt: completed ?? record.updatedAt,
    completedAt: completed,
    outcome: record.lastResult?.outcome ?? record.status,
    summary: record.lastResult?.summary ?? null,
    metadata: {
      durationMs: execution.durationMs ?? null,
      provider: execution.providerKey ?? null,
      model: execution.model ?? null
    },
    extensions: {
      openreactor: {
        issueNumber: record.issueNumber,
        issueTitle: record.issueTitle,
        issueUrl: buildIssueUrl(record.issueNumber),
        branchName: record.branchName,
        stage: execution.stage ?? nodeId,
        providerLabel: execution.providerLabel ?? null,
        toolName: execution.toolName ?? null,
        toolLabel: execution.toolLabel ?? null,
        primaryUse: execution.primaryUse ?? null,
        reasoningEffort: execution.reasoningEffort ?? null,
        serviceTier: execution.serviceTier ?? null
      }
    }
  };
}

function inferExecutionNodeId(record: RunRecordSummary): string {
  if (record.status === "retry" || record.status === "failed") {
    return "execution";
  }
  if (record.status === "accepted" || record.status === "rejected" || record.status === "decomposed") {
    return "completed";
  }
  if (record.status === "waiting-maintainer") {
    return "waiting";
  }
  return "execution";
}

function buildNodeSnapshot(input: {
  id: string;
  label: string;
  kind: AutomationStatusWorkflowNode["kind"];
  status: AutomationStatusWorkflowNode["status"];
  items: AutomationStatusWorkItem[];
  counts?: AutomationStatusCounts;
  capacity?: AutomationStatusWorkflowNode["capacity"];
}): AutomationStatusWorkflowNode {
  const visibleItems = input.items.slice(0, MAX_STAGE_ITEMS);
  return {
    id: input.id,
    label: input.label,
    kind: input.kind,
    status: input.status,
    capacity: input.capacity,
    counts: {
      totalItems: input.items.length,
      ...(input.counts ?? {})
    },
    samples: {
      items: {
        itemIds: visibleItems.map((item) => item.id),
        visibleCount: visibleItems.length,
        truncated: input.items.length > visibleItems.length
      }
    }
  };
}

function deriveNodeStatus(
  nodeId: string,
  itemsByNode: Map<string, AutomationStatusWorkItem[]>,
  incidents: AutomationStatusIncidentSnapshot[]
): AutomationStatusWorkflowNode["status"] {
  if (incidents.some((incident) => incident.scope.nodeIds?.includes(nodeId) && incident.severity === "error")) {
    return "degraded";
  }
  if ((itemsByNode.get(nodeId) ?? []).length > 0 && nodeId === "waiting") {
    return "degraded";
  }
  return "healthy";
}

function buildServiceSnapshot(
  id: string,
  label: string,
  status: ServiceStatus | null,
  generatedAt: string | null,
  watchdogState?: WatchdogStateFile | null
): AutomationStatusServiceSnapshot {
  const summary = summarizeService(status, generatedAt);
  const cooldownUntil =
    id === "watchdog" && typeof watchdogState?.serviceCooldownUntil === "string"
      ? watchdogState.serviceCooldownUntil
      : null;
  const serviceStatus =
    cooldownUntil && Date.parse(cooldownUntil) > Date.now()
      ? "cooldown"
      : mapServiceSummaryToHealth(summary);

  return {
    id,
    label,
    status: serviceStatus,
    active: Boolean(summary.active),
    updatedAt: typeof summary.snapshotGeneratedAt === "string" ? summary.snapshotGeneratedAt : null,
    restarts: Number(summary.restarts ?? 0),
    cooldownUntil,
    metadata: {
      execMainPid: summary.execMainPid
    },
    extensions: {
      openreactor: {
        ...summary,
        lastServiceFailureClass:
          typeof watchdogState?.lastServiceFailureClass === "string"
            ? watchdogState.lastServiceFailureClass
            : null,
        lastServiceActionAt:
          typeof watchdogState?.lastServiceActionAt === "string"
            ? watchdogState.lastServiceActionAt
            : null
      }
    }
  };
}

function mapRecentEvent(event: Record<string, unknown>): AutomationStatusEventSnapshot {
  const issueNumber = typeof event.issueNumber === "number" ? event.issueNumber : null;
  return {
    id: typeof event.id === "string" ? event.id : `event:${Date.now()}`,
    at: typeof event.at === "string" ? event.at : new Date().toISOString(),
    kind: typeof event.kind === "string" ? event.kind : "system",
    level: normalizeEventLevel(event.level),
    subjectType: issueNumber ? "item" : "system",
    subjectId: issueNumber ? createOpenReactorIssueItemId(issueNumber) : "openreactor",
    message: typeof event.message === "string" ? event.message : "",
    extensions: {
      openreactor: {
        issueNumber,
        iteration: typeof event.iteration === "number" ? event.iteration : null,
        title: typeof event.title === "string" ? event.title : ""
      }
    }
  };
}

function mapAgentStatus(status: string): AutomationStatusActorSnapshot["status"] {
  if (status === "failed") {
    return "failed";
  }
  if (status === "stalled") {
    return "stalled";
  }
  if (status === "provider-unavailable") {
    return "unavailable";
  }
  if (status === "waiting") {
    return "waiting";
  }
  return "working";
}

function normalizeEventLevel(level: unknown): AutomationStatusLevel {
  if (level === "error") {
    return "error";
  }
  if (level === "warn" || level === "warning") {
    return "warning";
  }
  return "info";
}

function mapServiceStatus(
  service: AutomationStatusServiceSnapshot | undefined
): AutomationStatusWorkflowNode["status"] {
  if (!service) {
    return "unknown";
  }
  if (service.status === "healthy") {
    return "healthy";
  }
  if (service.status === "unknown") {
    return "unknown";
  }
  return "degraded";
}

function mapServiceSummaryToHealth(
  summary: Record<string, unknown>
): AutomationStatusServiceSnapshot["status"] {
  const active = Boolean(summary.active);
  const activeState = typeof summary.activeState === "string" ? summary.activeState : "unknown";
  const snapshotFresh = Boolean(summary.snapshotFresh);

  if (active) {
    return snapshotFresh ? "healthy" : "degraded";
  }
  if (activeState === "failed") {
    return "down";
  }
  if (activeState === "inactive" || activeState === "deactivating") {
    return "paused";
  }
  if (activeState === "activating") {
    return "degraded";
  }
  return "unknown";
}

function deriveSystemStatus(
  services: AutomationStatusServiceSnapshot[],
  incidents: AutomationStatusIncidentSnapshot[]
): OpenReactorStatusPayload["system"]["status"] {
  if (incidents.some((incident) => incident.severity === "error" || incident.severity === "critical")) {
    return "degraded";
  }
  if (services.some((service) => service.status === "down")) {
    return "degraded";
  }
  if (services.every((service) => service.status === "unknown")) {
    return "unknown";
  }
  return "healthy";
}

function nodeStatusForEdge(
  nodes: AutomationStatusWorkflowNode[],
  fromNodeId: string,
  toNodeId: string
): AutomationStatusWorkflowEdge["status"] {
  const statuses = nodes
    .filter((node) => node.id === fromNodeId || node.id === toNodeId)
    .map((node) => node.status);

  if (statuses.includes("degraded") || statuses.includes("down")) {
    return "degraded";
  }
  if (statuses.includes("unknown")) {
    return "unknown";
  }
  return "healthy";
}

function readOpenReactorExtension(extensions: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!extensions) {
    return {};
  }

  const maybeExtension = extensions.openreactor;
  if (typeof maybeExtension !== "object" || maybeExtension === null || Array.isArray(maybeExtension)) {
    return {};
  }

  return maybeExtension as Record<string, unknown>;
}

function dedupeItemsById(items: AutomationStatusWorkItem[]): AutomationStatusWorkItem[] {
  const itemMap = new Map<string, AutomationStatusWorkItem>();
  for (const item of items) {
    itemMap.set(item.id, item);
  }
  return Array.from(itemMap.values());
}

function hasLabel(issue: GitHubIssue, labelName: string): boolean {
  const normalized = labelName.trim().toLowerCase();
  return issue.labels.some((label) => (label.name ?? "").trim().toLowerCase() === normalized);
}

function summarizeService(
  status: ServiceStatus | null,
  generatedAt: string | null
): Record<string, unknown> {
  if (!status) {
    return {
      active: false,
      activeState: "unknown",
      subState: "unknown",
      result: "unknown",
      restarts: 0,
      execMainPid: 0,
      snapshotGeneratedAt: generatedAt,
      snapshotFresh: false
    };
  }

  return {
    active: isServiceActive(status),
    activeState: status.activeState,
    subState: status.subState,
    result: status.result,
    restarts: status.restarts,
    execMainPid: status.execMainPid,
    snapshotGeneratedAt: generatedAt,
    snapshotFresh: isSnapshotFresh(generatedAt)
  };
}

function isSnapshotFresh(generatedAt: string | null): boolean {
  if (!generatedAt) {
    return false;
  }

  const timestamp = Date.parse(generatedAt);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return Date.now() - timestamp <= Math.max(reactorConfig.pollIntervalMs * 2, 5 * 60_000);
}

function safeReadServiceStatus(serviceName: string): ServiceStatus | null {
  try {
    return readServiceStatus(serviceName);
  } catch {
    return null;
  }
}

function buildIssueUrl(issueNumber: number): string {
  return `https://github.com/${reactorConfig.owner}/${reactorConfig.repo}/issues/${issueNumber}`;
}

function isAuthorized(request: IncomingMessage): boolean {
  if (!statusConfig.authToken) {
    return true;
  }

  const header = request.headers.authorization ?? "";
  return header === `Bearer ${statusConfig.authToken}`;
}

function writeJson(response: ServerResponse, statusCode: number, data: Record<string, unknown>): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type"
  });
  response.end(`${JSON.stringify(data)}\n`);
}

void main();
