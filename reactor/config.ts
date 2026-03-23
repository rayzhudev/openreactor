import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { WorkspacePolicy } from "../packages/contracts/src/runtime";
import { resolveWorkspacePolicy } from "./workspace-policy";

export interface OrchestratorConfig {
  engineRoot: string;
  repoRoot: string;
  runsDir: string;
  worktreesDir: string;
  defaultBranch: string;
  workspacePolicyPath: string | null;
  workspacePolicy: WorkspacePolicy;
  pollIntervalMs: number;
  maxIterationRuntimeMs: number;
  maxConcurrentIssues: number;
  maxIterationsPerIssue: number;
  maxStartFailuresPerIssue: number;
  runningLabel: string;
  pausedLabel: string;
  acceptedLabel: string;
  rejectedLabel: string;
  maintainerSteeredLabel: string;
  authenticatedSubmitterLabel: string;
  featureRequestMarker: string;
  branchPrefix: string;
  owner: string;
  repo: string;
  githubToken: string;
  githubAppId: string;
  githubAppClientId: string;
  githubAppInstallationId: string;
  githubAppPrivateKey: string;
  triageModel: string;
  triageReasoningEffort: string;
  triageServiceTier: string;
  plannerModel: string;
  plannerReasoningEffort: string;
  plannerServiceTier: string;
  agentModel: string;
  agentReasoningEffort: string;
  agentServiceTier: string;
  claudeUiModel: string;
  claudeUiEffort: string;
  claudeUiBin: string;
  botMentionAliases: string[];
}

const ENGINE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadConfig(repoRoot = resolveManagedRepoRoot()): OrchestratorConfig {
  const engineRoot = clean(process.env.OPENREACTOR_ENGINE_ROOT) || ENGINE_ROOT;
  const stateRoot = path.join(repoRoot, ".openreactor");
  const localEnv = loadLocalEnv(repoRoot, engineRoot);
  const workspacePolicy = resolveWorkspacePolicy(repoRoot);

  return {
    engineRoot,
    repoRoot,
    runsDir: path.join(stateRoot, "runs"),
    worktreesDir: path.join(stateRoot, "worktrees"),
    defaultBranch: resolveDefaultBranch(repoRoot, localEnv),
    workspacePolicyPath: workspacePolicy.path,
    workspacePolicy: workspacePolicy.policy,
    pollIntervalMs: numberFromEnv("OPENREACTOR_POLL_INTERVAL_MS", 60_000),
    maxIterationRuntimeMs: numberFromEnv("OPENREACTOR_MAX_ITERATION_RUNTIME_MS", 20 * 60_000),
    maxConcurrentIssues: numberFromEnv("OPENREACTOR_MAX_CONCURRENT_ISSUES", 3),
    maxIterationsPerIssue: numberFromEnv("OPENREACTOR_MAX_ITERATIONS_PER_ISSUE", 8),
    maxStartFailuresPerIssue: numberFromEnv("OPENREACTOR_MAX_START_FAILURES_PER_ISSUE", 3),
    runningLabel: clean(process.env.OPENREACTOR_RUNNING_LABEL) || "or:running",
    pausedLabel: clean(process.env.OPENREACTOR_PAUSED_LABEL) || "or:paused",
    acceptedLabel: clean(process.env.OPENREACTOR_ACCEPTED_LABEL) || "accepted",
    rejectedLabel: clean(process.env.OPENREACTOR_REJECTED_LABEL) || "rejected",
    maintainerSteeredLabel:
      clean(process.env.OPENREACTOR_MAINTAINER_STEERED_LABEL) || "maintainer-steered",
    authenticatedSubmitterLabel:
      clean(process.env.OPENREACTOR_AUTHENTICATED_SUBMITTER_LABEL) ||
      "submitter:github-authenticated",
    featureRequestMarker: "<!-- openreactor:feature-request -->",
    branchPrefix: clean(process.env.OPENREACTOR_BRANCH_PREFIX) || "openreactor/issue-",
    owner: resolveOwner(repoRoot, localEnv),
    repo: resolveRepo(repoRoot, localEnv),
    githubToken: compactToken(valueOf("GITHUB_TOKEN", localEnv)),
    githubAppId: clean(valueOf("GITHUB_APP_ID", localEnv)),
    githubAppClientId: clean(valueOf("GITHUB_APP_CLIENT_ID", localEnv)),
    githubAppInstallationId: clean(valueOf("GITHUB_APP_INSTALLATION_ID", localEnv)),
    githubAppPrivateKey: clean(valueOf("GITHUB_APP_PRIVATE_KEY", localEnv)).replace(/\\n/g, "\n"),
    triageModel: clean(process.env.OPENREACTOR_TRIAGE_MODEL) || "gpt-5.3-codex-spark",
    triageReasoningEffort:
      clean(process.env.OPENREACTOR_TRIAGE_REASONING_EFFORT) || "low",
    triageServiceTier: clean(process.env.OPENREACTOR_TRIAGE_SERVICE_TIER),
    plannerModel:
      clean(process.env.OPENREACTOR_PLANNER_MODEL) ||
      clean(process.env.OPENREACTOR_AGENT_MODEL) ||
      "gpt-5.4",
    plannerReasoningEffort:
      clean(process.env.OPENREACTOR_PLANNER_REASONING_EFFORT) || "high",
    plannerServiceTier:
      clean(process.env.OPENREACTOR_PLANNER_SERVICE_TIER) ||
      clean(process.env.OPENREACTOR_AGENT_SERVICE_TIER),
    agentModel: clean(process.env.OPENREACTOR_AGENT_MODEL) || "gpt-5.4",
    agentReasoningEffort:
      clean(process.env.OPENREACTOR_AGENT_REASONING_EFFORT) || "medium",
    agentServiceTier: clean(process.env.OPENREACTOR_AGENT_SERVICE_TIER),
    claudeUiModel: clean(process.env.OPENREACTOR_CLAUDE_UI_MODEL) || "sonnet",
    claudeUiEffort: clean(process.env.OPENREACTOR_CLAUDE_UI_EFFORT) || "medium",
    claudeUiBin: clean(process.env.OPENREACTOR_CLAUDE_UI_BIN) || "claude",
    botMentionAliases: listFromEnv(
      "OPENREACTOR_BOT_MENTION_ALIASES",
      [
        "@openreactor",
        "@openreactor[bot]",
        "@open-reactor-bot",
        "@open-reactor-bot[bot]"
      ]
    )
  };
}

function resolveManagedRepoRoot(): string {
  return clean(process.env.OPENREACTOR_MANAGED_REPO_ROOT) || process.cwd();
}

function requiredEnv(name: string, localEnv: Map<string, string>): string {
  const value = clean(valueOf(name, localEnv));
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = clean(process.env[name]);
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return value;
}

function listFromEnv(name: string, fallback: string[]): string[] {
  const raw = clean(process.env[name]);
  if (!raw) {
    return fallback;
  }

  const values = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return values.length ? values : fallback;
}

function compactToken(value?: string): string {
  return clean(value).replace(/\s+/g, "");
}

function resolveOwner(repoRoot: string, localEnv: Map<string, string>): string {
  const explicit = clean(valueOf("GITHUB_OWNER", localEnv));
  if (explicit) {
    return explicit;
  }

  const remote = parseGitHubRemote(repoRoot);
  if (remote) {
    return remote.owner;
  }

  throw new Error("Missing required environment variable: GITHUB_OWNER");
}

function resolveRepo(repoRoot: string, localEnv: Map<string, string>): string {
  const explicit = clean(valueOf("GITHUB_REPO", localEnv));
  if (explicit) {
    return explicit;
  }

  const remote = parseGitHubRemote(repoRoot);
  if (remote) {
    return remote.repo;
  }

  throw new Error("Missing required environment variable: GITHUB_REPO");
}

export function resolveDefaultBranch(
  repoRoot: string,
  localEnv = new Map<string, string>()
): string {
  const explicit =
    clean(valueOf("OPENREACTOR_DEFAULT_BRANCH", localEnv)) ||
    clean(valueOf("GITHUB_DEFAULT_BRANCH", localEnv));
  if (explicit) {
    return explicit;
  }

  try {
    const raw = execFileSync(
      "git",
      ["-C", repoRoot, "symbolic-ref", "refs/remotes/origin/HEAD"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }
    ).trim();
    const match = raw.match(/^refs\/remotes\/origin\/(.+)$/);
    if (match?.[1]) {
      return match[1];
    }
  } catch {
    // Ignore missing origin HEAD.
  }

  try {
    const raw = execFileSync("git", ["-C", repoRoot, "remote", "show", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    const match = raw.match(/HEAD branch:\s+([^\r\n]+)/);
    if (match?.[1]) {
      return clean(match[1]);
    }
  } catch {
    // Ignore missing remote metadata.
  }

  try {
    const raw = execFileSync("git", ["-C", repoRoot, "branch", "--show-current"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    if (raw) {
      return raw;
    }
  } catch {
    // Ignore detached HEAD or git errors.
  }

  return "main";
}

function parseGitHubRemote(repoRoot: string): { owner: string; repo: string } | null {
  try {
    const raw = execFileSync("git", ["-C", repoRoot, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const match = raw.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/);
    if (!match) {
      return null;
    }

    return {
      owner: match[1] ?? "",
      repo: match[2] ?? ""
    };
  } catch {
    return null;
  }
}

function loadLocalEnv(repoRoot: string, engineRoot: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const filePath of localEnvPaths(repoRoot, engineRoot)) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const contents = fs.readFileSync(filePath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separator = trimmed.indexOf("=");
      if (separator <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separator).trim();
      const rawValue = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      const value = resolveLocalEnvValue(rawValue);
      if (!values.has(key)) {
        values.set(key, value);
      }
    }
  }

  return values;
}

function localEnvPaths(repoRoot: string, engineRoot: string): string[] {
  const homeDirectory = process.env.HOME ?? "";
  const repoRoots = Array.from(new Set([repoRoot, engineRoot].filter(Boolean)));
  const paths = repoRoots.flatMap((root) =>
    [".dev.vars", ".env.local", ".env"].map((fileName) => path.join(root, fileName))
  );

  if (homeDirectory) {
    paths.push(path.join(homeDirectory, ".config", "openreactor", "reactor.env"));
  }

  return paths;
}

function resolveLocalEnvValue(value: string): string {
  const fileReferenceMatch = value.match(/^\$\(<\s*([^)]+?)\s*\)$/);
  if (!fileReferenceMatch) {
    return value;
  }

  const referencedPath = clean(fileReferenceMatch[1]);
  if (!referencedPath || !fs.existsSync(referencedPath)) {
    return value;
  }

  return fs.readFileSync(referencedPath, "utf8").trimEnd();
}

function valueOf(name: string, localEnv: Map<string, string>): string {
  return process.env[name] ?? localEnv.get(name) ?? "";
}

function clean(value?: string): string {
  return (value ?? "").trim();
}
