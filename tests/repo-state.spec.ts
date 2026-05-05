import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  REPO_STATE_DIR,
  REQUIRED_REPO_STATE_DOCS,
  checkRepoStateReadiness,
  initializeRepoState
} from "../reactor/repo-state";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
});

describe("repo state readiness", () => {
  test("reports missing required Genesis documents", async () => {
    const repoRoot = createTempRepoRoot();
    const readiness = await checkRepoStateReadiness(repoRoot);

    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toEqual([...REQUIRED_REPO_STATE_DOCS]);
    expect(readiness.placeholders).toEqual([]);
  });

  test("reports bootstrap placeholders as not ready", async () => {
    const repoRoot = createTempRepoRoot();
    await initializeRepoState(repoRoot, "Example Product");

    const readiness = await checkRepoStateReadiness(repoRoot);

    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toEqual([]);
    expect(readiness.placeholders).toContain("README.md");
    expect(readiness.placeholders).toContain("PRODUCT_SPEC.md");
  });

  test("accepts concrete repo-local product steering docs", async () => {
    const repoRoot = createTempRepoRoot();
    const repoStateDir = path.join(repoRoot, REPO_STATE_DIR);
    await fs.mkdir(repoStateDir, { recursive: true });

    for (const fileName of REQUIRED_REPO_STATE_DOCS) {
      await fs.writeFile(
        path.join(repoStateDir, fileName),
        [
          `# ${fileName.replace(/\.md$/, "").replace(/_/g, " ")}`,
          "",
          "OpenReactor builds and operates this product through GitHub issues, Codex agents, and repo-local product steering.",
          "",
          "This document is intentionally specific enough for implementation agents to use without relying on bootstrap placeholder text."
        ].join("\n") + "\n",
        "utf8"
      );
    }

    const readiness = await checkRepoStateReadiness(repoRoot);

    expect(readiness.ready).toBe(true);
    expect(readiness.missing).toEqual([]);
    expect(readiness.placeholders).toEqual([]);
  });
});

function createTempRepoRoot(): string {
  const repoRoot = path.join(
    os.tmpdir(),
    `openreactor-repo-state-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  tempDirs.push(repoRoot);
  return repoRoot;
}
