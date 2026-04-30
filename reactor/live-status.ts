import fs from "node:fs/promises";
import path from "node:path";
import type { AgentToolName } from "./agent-tools";

export interface ReactorLiveAgentSnapshot {
  issueNumber: number;
  issueTitle: string;
  issueUrl: string;
  branchName: string;
  iteration: number;
  targetSurface?: "main" | "playground" | "openreactor-core";
  toolName: AgentToolName;
  toolLabel: string;
  provider: "codex" | "claude";
  providerLabel?: string | null;
  model?: string | null;
  reasoningEffort?: string | null;
  serviceTier?: string | null;
  primaryUse: "general" | "planning" | "ui";
  sensitivity?: "low" | "medium" | "high";
  evidenceStrength?: "weak" | "moderate" | "strong";
  startedAt: string;
  updatedAt: string;
  lastHeartbeatAt: string;
  status: string;
  summary?: string | null;
  runDir: string;
}

export interface ReactorLiveSnapshot {
  generatedAt: string;
  reactor: {
    pid: number;
    dryRun: boolean;
    pollIntervalMs: number;
    maxConcurrentIssues: number;
    maxIterationRuntimeMs: number;
    activeRunCount: number;
    pendingRetryCount: number;
  };
  activeAgents: ReactorLiveAgentSnapshot[];
}

export interface OpenReactorStatusPaths {
  liveDir: string;
  reactorSnapshotPath: string;
}

export function getOpenReactorStatusPaths(repoRoot: string): OpenReactorStatusPaths {
  const liveDir = path.join(repoRoot, ".openreactor", "live");

  return {
    liveDir,
    reactorSnapshotPath: path.join(liveDir, "reactor-status.json")
  };
}

export async function writeReactorLiveSnapshot(
  repoRoot: string,
  snapshot: ReactorLiveSnapshot
): Promise<void> {
  const paths = getOpenReactorStatusPaths(repoRoot);
  await fs.mkdir(paths.liveDir, { recursive: true });
  await writeJsonAtomically(paths.reactorSnapshotPath, snapshot);
}

export async function readReactorLiveSnapshot(repoRoot: string): Promise<ReactorLiveSnapshot | null> {
  const paths = getOpenReactorStatusPaths(repoRoot);

  try {
    const raw = await fs.readFile(paths.reactorSnapshotPath, "utf8");
    return JSON.parse(raw) as ReactorLiveSnapshot;
  } catch {
    return null;
  }
}

async function writeJsonAtomically(filePath: string, data: unknown): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}
