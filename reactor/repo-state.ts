import fs from "node:fs/promises";
import path from "node:path";

export const REPO_STATE_DIR = path.join(".openreactor", "repo");

export interface RepoDocumentationPaths {
  readme: string;
  productSpec: string;
  productConstitution: string;
  roadmap: string;
  memory: string;
  uiSystem: string | null;
}

export interface RepoStateSeedIssue {
  number: number;
  title: string;
  body: string | null;
}

export interface RepoStateSeeds {
  readmeBody?: string | null;
  issues?: RepoStateSeedIssue[];
}

export async function resolveRepoDocumentationPaths(repoRoot: string): Promise<RepoDocumentationPaths> {
  return {
    readme: await preferRepoStateDoc(repoRoot, "README.md"),
    productSpec: await preferRepoStateDoc(repoRoot, "PRODUCT_SPEC.md"),
    productConstitution: await preferRepoStateDoc(repoRoot, "PRODUCT_CONSTITUTION.md"),
    roadmap: await preferRepoStateDoc(repoRoot, "ROADMAP.md"),
    memory: await preferRepoStateDoc(repoRoot, "MEMORY.md"),
    uiSystem: await resolveOptionalRepoDoc(repoRoot, "UI_SYSTEM.md")
  };
}

async function preferRepoStateDoc(repoRoot: string, fileName: string): Promise<string> {
  const repoStatePath = path.join(repoRoot, REPO_STATE_DIR, fileName);
  if (await pathExists(repoStatePath)) {
    return repoStatePath;
  }

  return path.join(repoRoot, fileName);
}

async function resolveOptionalRepoDoc(repoRoot: string, fileName: string): Promise<string | null> {
  const repoStatePath = path.join(repoRoot, REPO_STATE_DIR, fileName);
  if (await pathExists(repoStatePath)) {
    return repoStatePath;
  }

  const legacyPath = path.join(repoRoot, fileName);
  if (await pathExists(legacyPath)) {
    return legacyPath;
  }

  return null;
}

export async function initializeRepoState(
  repoRoot: string,
  repoName: string,
  seeds: RepoStateSeeds = {}
): Promise<string[]> {
  const targetDir = path.join(repoRoot, REPO_STATE_DIR);
  await fs.mkdir(targetDir, { recursive: true });

  const writtenPaths: string[] = [];
  for (const [fileName, template] of Object.entries(repoStateTemplates(repoName, seeds))) {
    const targetPath = path.join(targetDir, fileName);
    if (await pathExists(targetPath)) {
      continue;
    }

    await fs.writeFile(targetPath, template, "utf8");
    writtenPaths.push(targetPath);
  }

  return writtenPaths;
}

function repoStateTemplates(repoName: string, seeds: RepoStateSeeds): Record<string, string> {
  const readmeSummary = summarizeReadme(seeds.readmeBody ?? "");
  const issueSummary = summarizeIssues(seeds.issues ?? []);

  return {
    "README.md": [
      `# ${repoName}`,
      "",
      "This directory contains the repo-local OpenReactor state for this product.",
      "",
      "OpenReactor's shared engine lives outside this repo-local state. What belongs here is the product-specific material that future issue agents should inherit:",
      "",
      "- what this repo is for",
      "- what counts as a good change",
      "- what to avoid",
      "- roadmap direction",
      "- durable memory from past work",
      "",
      "Treat these files as the product steering layer for this repository.",
      "",
      "## Bootstrap signals",
      "",
      ...(readmeSummary
        ? [
            "### README signal",
            "",
            readmeSummary
          ]
        : ["_No README signal was detected during bootstrap._"]),
      "",
      ...(issueSummary
        ? [
            "### Issue signal",
            "",
            issueSummary
          ]
        : ["_No GitHub issue signal was detected during bootstrap._"])
    ].join("\n") + "\n",
    "PRODUCT_SPEC.md": [
      `# ${repoName} Product Spec`,
      "",
      "## Product summary",
      "",
      readmeSummary ||
        "Describe what this repository's product is, who it is for, and what the main user-facing surfaces are.",
      "",
      "## Core workflows",
      "",
      "- List the main user journeys.",
      "- Note which flows are highest sensitivity.",
      "",
      "## Current constraints",
      "",
      "- Document any technical or product constraints that issue agents should respect."
    ].join("\n") + "\n",
    "PRODUCT_CONSTITUTION.md": [
      "# Product Constitution",
      "",
      "## Mission",
      "",
      "State what this product is meant to optimize for.",
      "",
      "## Standing rules",
      "",
      "- List the durable product rules agents should treat as binding.",
      "- Note what kinds of requests should be rejected.",
      "- Note which surfaces are high-sensitivity.",
      "",
      "## Human handoff rules",
      "",
      "- Document what should happen when a maintainer-only step is required."
    ].join("\n") + "\n",
    "ROADMAP.md": [
      "# Roadmap",
      "",
      "## Near-term priorities",
      "",
      "- Add the current priorities for this repo.",
      ...(issueSummary
        ? [
            "",
            "## Signals from existing issues",
            "",
            issueSummary
          ]
        : []),
      "",
      "## Not now",
      "",
      "- Add ideas that are explicitly out of scope for the current stage."
    ].join("\n") + "\n",
    "MEMORY.md": [
      "# Memory",
      "",
      "Record durable product and workflow learnings here.",
      ...(readmeSummary
        ? [
            "",
            "## Bootstrap context",
            "",
            readmeSummary
          ]
        : []),
      "",
      "## Decisions",
      "",
      "- Add dated decisions with a short reason so future agents inherit them."
    ].join("\n") + "\n"
  };
}

function summarizeReadme(readmeBody: string): string {
  const normalized = stripMarkdownNoise(readmeBody)
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .filter((chunk) => !chunk.startsWith("#"));

  return normalized.slice(0, 2).join("\n\n");
}

function summarizeIssues(issues: RepoStateSeedIssue[]): string {
  return issues
    .slice(0, 5)
    .map((issue) =>
      [
        `- #${issue.number} ${issue.title}`,
        issue.body
          ? `  ${truncateInline(stripMarkdownNoise(issue.body), 220)}`
          : "  _No body provided._"
      ].join("\n")
    )
    .join("\n");
}

function stripMarkdownNoise(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\(([^)]+)\)/g, " ")
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1")
    .replace(/\r/g, "")
    .trim();
}

function truncateInline(value: string, maxLength: number): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }

  return `${singleLine.slice(0, maxLength - 1).trimEnd()}…`;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
