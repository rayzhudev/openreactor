import fs from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { WorkspacePolicy } from "../packages/contracts/src/runtime";

const execFileAsync = promisify(execFile);

export interface ResolvedWorkspacePolicy {
  path: string | null;
  policy: WorkspacePolicy;
}

const DEFAULT_WORKSPACE_POLICY: WorkspacePolicy = {
  version: 1,
  executionMode: "isolated-worktree"
};

export function resolveWorkspacePolicy(repoRoot: string): ResolvedWorkspacePolicy {
  for (const filePath of workspacePolicyCandidates(repoRoot)) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as WorkspacePolicy;
      return {
        path: filePath,
        policy: normalizeWorkspacePolicy(parsed)
      };
    } catch (error) {
      throw new Error(
        `Unable to parse workspace policy at ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return {
    path: null,
    policy: DEFAULT_WORKSPACE_POLICY
  };
}

export async function runWorkspacePolicyCommand(input: {
  command: string;
  cwd: string;
  env?: Record<string, string>;
  phase: "provision" | "teardown";
  policyPath: string | null;
  issueNumber: number;
  branchName: string;
  runDir: string;
}): Promise<{ stdout: string; stderr: string }> {
  const shell = process.env.SHELL || "/bin/zsh";
  const env = {
    ...process.env,
    ...(input.env ?? {}),
    OPENREACTOR_WORKSPACE_PHASE: input.phase,
    OPENREACTOR_WORKSPACE_POLICY_PATH: input.policyPath ?? "",
    OPENREACTOR_ISSUE_NUMBER: String(input.issueNumber),
    OPENREACTOR_BRANCH_NAME: input.branchName,
    OPENREACTOR_RUN_DIR: input.runDir
  };

  return execFileAsync(shell, ["-lc", input.command], {
    cwd: input.cwd,
    env
  });
}

function workspacePolicyCandidates(repoRoot: string): string[] {
  return [
    path.join(repoRoot, ".openreactor", "repo", "workspace-policy.json"),
    path.join(repoRoot, "workspace-policy.json")
  ];
}

function normalizeWorkspacePolicy(input: WorkspacePolicy): WorkspacePolicy {
  return {
    version: 1,
    executionMode: "isolated-worktree",
    provisionCommand: clean(input.provisionCommand),
    teardownCommand: clean(input.teardownCommand),
    env: normalizeEnv(input.env)
  };
}

function normalizeEnv(env: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!env || typeof env !== "object") {
    return undefined;
  }

  const normalized = Object.fromEntries(
    Object.entries(env)
      .map(([key, value]) => [key.trim(), clean(value)])
      .filter(([key, value]) => key && value)
  );

  return Object.keys(normalized).length ? normalized : undefined;
}

function clean(value?: string): string | undefined {
  const normalized = (value ?? "").trim();
  return normalized || undefined;
}
