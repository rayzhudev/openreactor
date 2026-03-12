import fs from "node:fs/promises";
import path from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig as loadReactorConfig } from "../reactor/config";
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
    prUrl?: string | null;
    humanHandoff?: {
      required: boolean;
      instructions: string;
    } | null;
  } | null;
}

const reactorConfig = loadReactorConfig();
const statusConfig = loadOpenReactorStatusConfig();

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
  const handoffs = await listMaintainerHandoffs();
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
      pausedCount: countPausedIssues(watchdogState),
      pausedIssues: listPausedIssues(watchdogState),
      maintainerHandoffCount: handoffs.length,
      maintainerHandoffs: handoffs
    }
  };
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

async function listMaintainerHandoffs(): Promise<
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

function countPausedIssues(state: WatchdogStateFile | null): number {
  return listPausedIssues(state).length;
}

function listPausedIssues(state: WatchdogStateFile | null): Array<Record<string, unknown>> {
  if (!state?.issues) {
    return [];
  }

  return Object.entries(state.issues)
    .filter(([, issue]) => {
      return Boolean(issue.lastFailureClass || issue.repairIssueNumber || issue.lastEscalatedAt);
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
