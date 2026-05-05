import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { resolveWorkspacePolicy, runWorkspacePolicyCommand } from "../reactor/workspace-policy";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (!dir) {
      continue;
    }
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

describe("workspace policy", () => {
  test("returns the default isolated-worktree policy when no file exists", () => {
    const repoRoot = createTempRepoRoot();
    const resolved = resolveWorkspacePolicy(repoRoot);

    expect(resolved.path).toBeNull();
    expect(resolved.policy).toEqual({
      version: 1,
      executionMode: "isolated-worktree"
    });
  });

  test("prefers repo-local policy and normalizes optional fields", async () => {
    const repoRoot = createTempRepoRoot();
    const policyPath = path.join(repoRoot, ".openreactor", "repo", "workspace-policy.json");
    await fs.mkdir(path.dirname(policyPath), { recursive: true });
    await fs.writeFile(
      policyPath,
      JSON.stringify({
        version: 1,
        executionMode: "isolated-worktree",
        provisionCommand: "  bun install  ",
        teardownCommand: "  bun run clean  ",
        env: {
          FOO: " bar ",
          EMPTY: "   "
        }
      }),
      "utf8"
    );

    const resolved = resolveWorkspacePolicy(repoRoot);

    expect(resolved.path).toBe(policyPath);
    expect(resolved.policy).toEqual({
      version: 1,
      executionMode: "isolated-worktree",
      provisionCommand: "bun install",
      teardownCommand: "bun run clean",
      env: {
        FOO: "bar"
      }
    });
  });

  test("runs provision command with policy environment", async () => {
    const repoRoot = createTempRepoRoot();
    const runDir = path.join(repoRoot, ".openreactor", "runs", "issue-7");
    await fs.mkdir(repoRoot, { recursive: true });
    await fs.mkdir(runDir, { recursive: true });

    const result = await runWorkspacePolicyCommand({
      command:
        'printf "%s:%s:%s" "$OPENREACTOR_WORKSPACE_PHASE" "$CUSTOM_VALUE" "$OPENREACTOR_BRANCH_NAME"',
      cwd: repoRoot,
      env: {
        CUSTOM_VALUE: "from-policy"
      },
      phase: "provision",
      policyPath: path.join(repoRoot, "workspace-policy.json"),
      issueNumber: 7,
      branchName: "openreactor/issue-7",
      runDir
    });

    expect(result.stdout).toBe("provision:from-policy:openreactor/issue-7");
    expect(result.stderr).toBe("");
  });
});

function createTempRepoRoot(): string {
  const repoRoot = path.join(
    os.tmpdir(),
    `openreactor-workspace-policy-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  tempDirs.push(repoRoot);
  return repoRoot;
}
