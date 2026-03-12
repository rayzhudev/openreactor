import fs from "node:fs/promises";
import path from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig as loadReactorConfig } from "../reactor/config";
import { GitHubClient, type GitHubIssue } from "../reactor/github";
import {
  getOpenReactorStatusPaths,
  readReactorLiveSnapshot,
  type ReactorLiveSnapshot
} from "../reactor/live-status";
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

async function buildStatusPayload(): Promise<Record<string, unknown>> {
  const reactorSnapshot = await readReactorLiveSnapshot(reactorConfig.repoRoot);
  const watchdogState = await readWatchdogState();
  const runRecords = await listRunRecordSummaries();
  const openIssues = await github.listOpenIssues();
  const openIssueMap = new Map(openIssues.map((issue) => [issue.number, issue] as const));
  const handoffs = await listMaintainerHandoffs(openIssueMap);
  const pausedIssues = listPausedIssues(watchdogState, openIssueMap);
  const reactorService = safeReadServiceStatus(statusConfig.reactorServiceName);
  const watchdogService = safeReadServiceStatus(statusConfig.watchdogServiceName);
  const now = new Date().toISOString();

  return {
    ok: true,
    available: true,
    generatedAt: now,
    repo: {
      owner: reactorConfig.owner,
      repo: reactorConfig.repo
    },
    services: {
      reactor: summarizeService(reactorService, reactorSnapshot?.generatedAt ?? null),
      watchdog: summarizeService(watchdogService, watchdogState?.updatedAt ?? null)
    },
    agents: {
      activeCount: reactorSnapshot?.activeAgents.length ?? 0,
      pendingRetryCount: reactorSnapshot?.reactor.pendingRetryCount ?? 0,
      maxConcurrentIssues: reactorSnapshot?.reactor.maxConcurrentIssues ?? reactorConfig.maxConcurrentIssues,
      items: reactorSnapshot?.activeAgents ?? []
    },
    blockers: {
      pausedCount: pausedIssues.length,
      pausedIssues,
      maintainerHandoffCount: handoffs.length,
      maintainerHandoffs: handoffs
    },
    pipeline: buildLocalPipeline({
      generatedAt: now,
      reactorSnapshot,
      runRecords,
      pausedIssues,
      maintainerHandoffs: handoffs
    })
  };
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

function buildLocalPipeline(input: {
  generatedAt: string;
  reactorSnapshot: ReactorLiveSnapshot | null;
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
}): Record<string, unknown> {
  const planningAgents = (input.reactorSnapshot?.activeAgents ?? [])
    .filter((agent) => agent.primaryUse === "planning")
    .map((agent) => ({
      lane: "planning",
      issueNumber: agent.issueNumber,
      issueTitle: agent.issueTitle,
      issueUrl: agent.issueUrl,
      branchName: agent.branchName,
      iteration: agent.iteration,
      status: agent.status,
      toolName: agent.toolName,
      toolLabel: agent.toolLabel,
      provider: agent.provider,
      primaryUse: agent.primaryUse,
      startedAt: agent.startedAt,
      updatedAt: agent.updatedAt,
      lastHeartbeatAt: agent.lastHeartbeatAt,
      summary: agent.summary ?? null
    }));
  const triageItems = input.runRecords
    .filter((record) => record.triageExecution?.startedAt)
    .slice(0, MAX_STAGE_ITEMS)
    .map((record) => ({
      lane: "triage",
      issueNumber: record.issueNumber,
      issueTitle: record.issueTitle,
      issueUrl: buildIssueUrl(record.issueNumber),
      branchName: record.branchName,
      status: record.status,
      startedAt: record.triageExecution?.startedAt ?? null,
      completedAt: record.triageExecution?.completedAt ?? null,
      provider: record.triageExecution?.providerKey ?? null,
      providerLabel: record.triageExecution?.providerLabel ?? null,
      toolName: record.triageExecution?.toolName ?? null,
      toolLabel: record.triageExecution?.toolLabel ?? null,
      primaryUse: record.triageExecution?.primaryUse ?? null,
      stage: record.triageExecution?.stage ?? "triage"
    }));
  const executionItems = (input.reactorSnapshot?.activeAgents ?? [])
    .filter((agent) => agent.primaryUse !== "planning")
    .map((agent) => ({
      lane: "execution",
      issueNumber: agent.issueNumber,
      issueTitle: agent.issueTitle,
      issueUrl: agent.issueUrl,
      branchName: agent.branchName,
      iteration: agent.iteration,
      status: agent.status,
      toolName: agent.toolName,
      toolLabel: agent.toolLabel,
      provider: agent.provider,
      primaryUse: agent.primaryUse,
      startedAt: agent.startedAt,
      updatedAt: agent.updatedAt,
      lastHeartbeatAt: agent.lastHeartbeatAt,
      summary: agent.summary ?? null
    }));
  const retryItems = input.runRecords
    .filter((record) => record.status === "retry" || record.status === "failed")
    .slice(0, MAX_STAGE_ITEMS)
    .map((record) => ({
      lane: "retry",
      issueNumber: record.issueNumber,
      issueTitle: record.issueTitle,
      issueUrl: buildIssueUrl(record.issueNumber),
      branchName: record.branchName,
      status: record.status,
      updatedAt: record.updatedAt,
      lastHeartbeatAt: record.lastHeartbeatAt,
      reason: record.lastError || null
    }));
  const blockedItems = [
    ...input.maintainerHandoffs.map((handoff) => ({
      lane: "maintainer-handoff",
      issueNumber: handoff.issueNumber,
      issueTitle: handoff.issueTitle,
      issueUrl: handoff.issueUrl,
      branchName: handoff.branchName,
      status: "waiting-maintainer",
      updatedAt: handoff.updatedAt,
      prUrl: handoff.prUrl,
      instructions: handoff.instructions
    })),
    ...input.pausedIssues.map((issue) => ({
      lane: "paused",
      ...issue
    }))
  ].slice(0, MAX_STAGE_ITEMS);
  const completedItems = input.runRecords
    .filter((record) => ["accepted", "rejected", "decomposed"].includes(record.status))
    .slice(0, MAX_STAGE_ITEMS)
    .map((record) => ({
      lane: record.status,
      issueNumber: record.issueNumber,
      issueTitle: record.issueTitle,
      issueUrl: buildIssueUrl(record.issueNumber),
      branchName: record.branchName,
      status: record.status,
      updatedAt: record.updatedAt,
      completedAt: record.lastAgentExecution?.completedAt ?? record.updatedAt,
      provider: record.lastAgentExecution?.providerKey ?? null,
      providerLabel: record.lastAgentExecution?.providerLabel ?? null,
      toolName: record.lastAgentExecution?.toolName ?? null,
      toolLabel: record.lastAgentExecution?.toolLabel ?? null,
      primaryUse: record.lastAgentExecution?.primaryUse ?? null,
      outcome: record.lastResult?.outcome ?? record.status,
      prUrl: record.lastResult?.prUrl ?? null,
      summary: record.lastResult?.summary ?? null
    }));

  return {
    version: 1,
    generatedAt: input.generatedAt,
    stages: [
      {
        key: "triage-planning",
        label: "Triage & planning",
        available: true,
        itemCount: planningAgents.length,
        items: planningAgents,
        recentTriage: triageItems
      },
      {
        key: "execution",
        label: "Execution",
        available: true,
        itemCount: executionItems.length,
        items: executionItems
      },
      {
        key: "retry",
        label: "Retry",
        available: true,
        itemCount: retryItems.length,
        pendingCount: input.reactorSnapshot?.reactor.pendingRetryCount ?? retryItems.length,
        items: retryItems
      },
      {
        key: "blocked",
        label: "Blocked",
        available: true,
        itemCount: blockedItems.length,
        items: blockedItems
      },
      {
        key: "completed",
        label: "Completed",
        available: true,
        itemCount: completedItems.length,
        items: completedItems
      }
    ]
  };
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
