import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { resolveWorkspacePolicy } from "../reactor/workspace-policy";

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
});

function createTempRepoRoot(): string {
  const repoRoot = path.join(
    os.tmpdir(),
    `openreactor-workspace-policy-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  tempDirs.push(repoRoot);
  return repoRoot;
}
