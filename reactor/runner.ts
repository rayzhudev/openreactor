import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { OrchestratorConfig } from "./config";
import type { GitHubIssue } from "./github";

export interface AgentTestResult {
  command: string;
  status: "passed" | "failed" | "not-run";
}

export interface HumanHandoff {
  required: boolean;
  instructions: string;
}

export interface AgentResult {
  issueNumber: number;
  outcome: "accepted" | "rejected" | "retry";
  summary: string;
  branchName?: string | null;
  prUrl?: string | null;
  issueComment?: string | null;
  nextStep?: string | null;
  humanHandoff?: HumanHandoff | null;
  tests: AgentTestResult[];
}

export interface RunRecord {
  issueNumber: number;
  issueTitle: string;
  branchName: string;
  status: "running" | "accepted" | "rejected" | "retry" | "failed";
  iteration: number;
  createdAt: string;
  updatedAt: string;
  lastHeartbeatAt: string;
  worktreePath: string;
  runDir: string;
  lastResult: AgentResult | null;
  lastError: string;
}

export interface IssueRuntimePaths {
  runDir: string;
  worktreePath: string;
  branchName: string;
  runFilePath: string;
  contextPath: string;
  progressPath: string;
  tasksPath: string;
  planPath: string;
}

export interface ActiveRun {
  issue: GitHubIssue;
  record: RunRecord;
  process: ChildProcessWithoutNullStreams;
  heartbeatTimer: ReturnType<typeof setInterval>;
  resultPath: string;
  logPath: string;
}

const RESULT_MARKER = "<!-- openreactor:agent-result -->";

export function issueRuntimePaths(config: OrchestratorConfig, issueNumber: number): IssueRuntimePaths {
  const runDir = path.join(config.runsDir, `issue-${issueNumber}`);
  const worktreePath = path.join(config.worktreesDir, `issue-${issueNumber}`);
  const branchName = `${config.branchPrefix}${issueNumber}`;

  return {
    runDir,
    worktreePath,
    branchName,
    runFilePath: path.join(runDir, "run.json"),
    contextPath: path.join(runDir, "context.md"),
    progressPath: path.join(runDir, "progress.md"),
    tasksPath: path.join(runDir, "tasks.md"),
    planPath: path.join(runDir, "plan.json")
  };
}

export async function ensureRuntimeDirectories(config: OrchestratorConfig): Promise<void> {
  await fs.mkdir(config.runsDir, { recursive: true });
  await fs.mkdir(config.worktreesDir, { recursive: true });
}

export async function readRunRecord(paths: IssueRuntimePaths): Promise<RunRecord | null> {
  try {
    const raw = await fs.readFile(paths.runFilePath, "utf8");
    return JSON.parse(raw) as RunRecord;
  } catch {
    return null;
  }
}

export async function writeRunRecord(paths: IssueRuntimePaths, record: RunRecord): Promise<void> {
  await fs.mkdir(paths.runDir, { recursive: true });
  await fs.writeFile(paths.runFilePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

export async function writeIssueContext(
  config: OrchestratorConfig,
  issue: GitHubIssue,
  paths: IssueRuntimePaths
): Promise<void> {
  const labels = issue.labels.map((label) => label.name).filter(Boolean).join(", ") || "_None_";

  const content = [
    "# Issue Context",
    "",
    `- Issue: #${issue.number}`,
    `- Title: ${issue.title}`,
    `- URL: ${issue.html_url}`,
    `- Labels: ${labels}`,
    `- Branch: ${paths.branchName}`,
    "",
    "## Issue Body",
    "",
    issue.body ?? "_No body provided._",
    "",
    "## Local Run Files",
    "",
    `- Progress log: ${relativeFromRepo(config, paths.progressPath)}`,
    `- Task tracker: ${relativeFromRepo(config, paths.tasksPath)}`,
    `- Plan file: ${relativeFromRepo(config, paths.planPath)}`,
    `- Run state: ${relativeFromRepo(config, paths.runFilePath)}`,
    "",
    "## Product Docs To Read",
    "",
    "- PRODUCT_SPEC.md",
    "- CONSTITUTION.md",
    "- ROADMAP.md",
    "- MEMORY.md",
    "- README.md"
  ].join("\n");

  await fs.mkdir(paths.runDir, { recursive: true });
  await fs.writeFile(paths.contextPath, `${content}\n`, "utf8");

  await ensureFileWithHeader(
    paths.progressPath,
    [
      "# Issue Progress",
      "",
      "## Codebase Patterns",
      "- Add reusable patterns and non-obvious repo conventions here for future iterations.",
      "",
      "## Iteration Log",
      "",
      `Issue: #${issue.number} ${issue.title}`,
      `Branch: ${paths.branchName}`,
      "",
      "Append-only progress log for fresh-context retries.",
      ""
    ].join("\n")
  );

  await ensureFileWithHeader(
    paths.tasksPath,
    [
      "# Task Tracker",
      "",
      "Track the issue as a markdown checklist so future iterations can continue with minimal context.",
      "",
      "- [ ] Restate the issue as a product decision",
      "- [ ] Define acceptance criteria",
      "- [ ] Implement the chosen change",
      "- [ ] Run relevant quality checks",
      "- [ ] Update docs and shared memory if needed",
      "- [ ] Prepare PR or human handoff"
    ].join("\n")
  );

  await ensurePlanScaffold(paths, issue);
}

export async function createInitialRunRecord(
  issue: GitHubIssue,
  paths: IssueRuntimePaths
): Promise<RunRecord> {
  const now = new Date().toISOString();
  return {
    issueNumber: issue.number,
    issueTitle: issue.title,
    branchName: paths.branchName,
    status: "running",
    iteration: 0,
    createdAt: now,
    updatedAt: now,
    lastHeartbeatAt: now,
    worktreePath: paths.worktreePath,
    runDir: paths.runDir,
    lastResult: null,
    lastError: ""
  };
}

export async function ensureIssueWorktree(
  config: OrchestratorConfig,
  paths: IssueRuntimePaths
): Promise<void> {
  await fs.mkdir(config.worktreesDir, { recursive: true });

  if (await pathExists(paths.worktreePath)) {
    return;
  }

  const branchExists = await runCommand("git", [
    "-C",
    config.repoRoot,
    "show-ref",
    "--verify",
    "--quiet",
    `refs/heads/${paths.branchName}`
  ]).then(() => true, () => false);

  if (branchExists) {
    await runCommand("git", [
      "-C",
      config.repoRoot,
      "worktree",
      "add",
      paths.worktreePath,
      paths.branchName
    ]);
    return;
  }

  await runCommand("git", [
    "-C",
    config.repoRoot,
    "worktree",
    "add",
    "-b",
    paths.branchName,
    paths.worktreePath,
    "main"
  ]);
}

export async function ensureRemoteBranchExists(repoRoot: string, branchName: string): Promise<boolean> {
  return runCommand("git", [
    "-C",
    repoRoot,
    "ls-remote",
    "--exit-code",
    "--heads",
    "origin",
    branchName
  ]).then(() => true, () => false);
}

export async function spawnIssueAgent(input: {
  config: OrchestratorConfig;
  issue: GitHubIssue;
  paths: IssueRuntimePaths;
  record: RunRecord;
  githubToken: string;
}): Promise<ActiveRun> {
  const { config, issue, paths, githubToken } = input;
  const iteration = input.record.iteration + 1;
  const schemaPath = path.join(config.repoRoot, "reactor", "agent-result.schema.json");
  const resultPath = path.join(paths.runDir, `iteration-${iteration}.result.json`);
  const logPath = path.join(paths.runDir, `iteration-${iteration}.log`);
  const promptPath = path.join(paths.runDir, `iteration-${iteration}.prompt.md`);
  const prompt = buildAgentPrompt(config, issue, paths, iteration);

  await fs.writeFile(promptPath, prompt, "utf8");

  const args = [
    "-a",
    "never",
    "-s",
    "danger-full-access",
    "exec",
    "-",
    "--skip-git-repo-check",
    "--output-schema",
    schemaPath,
    "-o",
    resultPath
  ];

  if (config.agentModel) {
    args.unshift(config.agentModel);
    args.unshift("-m");
  }

  const child = spawn("codex", args, {
    cwd: paths.worktreePath,
    env: {
      ...process.env,
      GH_TOKEN: githubToken,
      GITHUB_TOKEN: githubToken,
      OPENREACTOR_REPO_OWNER: config.owner,
      OPENREACTOR_REPO_NAME: config.repo,
      OPENREACTOR_ISSUE_NUMBER: String(issue.number),
      OPENREACTOR_ISSUE_URL: issue.html_url,
      OPENREACTOR_RUN_DIR: paths.runDir,
      OPENREACTOR_PLAN_PATH: paths.planPath,
      OPENREACTOR_PROGRESS_PATH: paths.progressPath,
      OPENREACTOR_TASKS_PATH: paths.tasksPath,
      OPENREACTOR_BRANCH_NAME: paths.branchName
    },
    stdio: ["pipe", "pipe", "pipe"]
  });

  child.stdin.end(prompt);

  const logHandle = await fs.open(logPath, "w");
  child.stdout.on("data", (chunk) => {
    void logHandle.appendFile(chunk);
  });
  child.stderr.on("data", (chunk) => {
    void logHandle.appendFile(chunk);
  });
  child.on("close", () => {
    void logHandle.close();
  });

  const record: RunRecord = {
    ...input.record,
    status: "running",
    iteration,
    updatedAt: new Date().toISOString(),
    lastHeartbeatAt: new Date().toISOString(),
    lastError: ""
  };
  await writeRunRecord(paths, record);

  const heartbeatTimer = setInterval(() => {
    record.updatedAt = new Date().toISOString();
    record.lastHeartbeatAt = record.updatedAt;
    void writeRunRecord(paths, record);
  }, 10_000);

  return {
    issue,
    record,
    process: child,
    heartbeatTimer,
    resultPath,
    logPath
  };
}

export async function finalizeIssueAgentRun(input: {
  activeRun: ActiveRun;
  paths: IssueRuntimePaths;
}): Promise<{ result: AgentResult | null; exitCode: number | null }> {
  const exitCode = await waitForExit(input.activeRun.process);
  clearInterval(input.activeRun.heartbeatTimer);

  const parsedResult = await parseAgentResult(input.activeRun.resultPath);
  input.activeRun.record.updatedAt = new Date().toISOString();
  input.activeRun.record.lastHeartbeatAt = input.activeRun.record.updatedAt;
  input.activeRun.record.lastResult = parsedResult;
  input.activeRun.record.status = parsedResult?.outcome ?? "failed";
  input.activeRun.record.lastError =
    exitCode === 0 && parsedResult ? "" : `codex exited with code ${exitCode ?? "unknown"}`;
  await writeRunRecord(input.paths, input.activeRun.record);

  return {
    result: parsedResult,
    exitCode
  };
}

function buildAgentPrompt(
  config: OrchestratorConfig,
  issue: GitHubIssue,
  paths: IssueRuntimePaths,
  iteration: number
): string {
  return [
    `You are OpenReactor's autonomous issue agent for GitHub issue #${issue.number}.`,
    "",
    "Read these files before doing anything else:",
    "- prompts/product-context.md",
    "- prompts/issue-agent.md",
    "- prompts/quality-gates.md",
    `- ${relativeFromWorktree(paths, paths.contextPath)}`,
    `- ${relativeFromWorktree(paths, paths.progressPath)}`,
    `- ${relativeFromWorktree(paths, paths.tasksPath)}`,
    "",
    "Execution context:",
    `- Iteration: ${iteration}`,
    `- Issue URL: ${issue.html_url}`,
    `- Run directory: ${paths.runDir}`,
    `- Branch to use: ${paths.branchName}`,
    "",
    "Rules for this run:",
    "- Stay on the current branch. Do not create a different branch name.",
    "- Treat the issue as product feedback, not a binding specification.",
    "- You may reject the request if that is better for the product.",
    "- If accepted, you may reinterpret the request and implement the best product change.",
    "- A starter plan.json already exists. Update it instead of replacing it with a different shape.",
    "- Append progress to progress.md before finishing.",
    "- If you discover durable learnings, update the relevant shared docs in prompts/, MEMORY.md, CONSTITUTION.md, or nearby product docs.",
    "- Never commit secrets, API keys, private tokens, or credentials.",
    "- Use gh for GitHub issue and PR operations. GH_TOKEN is already available.",
    "- Use `bun run reactor:tool ensure-plan ...` if the plan scaffold needs to be restored.",
    "- Use `bun run reactor:tool ensure-pr ...` when finishing an accepted run so PR creation is idempotent.",
    `- Keep the claim label ${config.runningLabel} in place if more iterations are needed.`,
    `- If you finish with accepted or rejected, remove ${config.runningLabel} yourself and apply the final label.`,
    "- If you return accepted, the reactor will verify that a remote branch exists, an open PR exists, at least one reported check passed, and no reported checks failed.",
    "- If human action is required, prepare a clean handoff with exact instructions and do not pretend the task is fully complete.",
    "",
    "Return only JSON matching the provided output schema.",
    "",
    RESULT_MARKER
  ].join("\n");
}

async function parseAgentResult(resultPath: string): Promise<AgentResult | null> {
  try {
    const raw = await fs.readFile(resultPath, "utf8");
    return JSON.parse(raw) as AgentResult;
  } catch {
    return null;
  }
}

async function ensureFileWithHeader(filePath: string, header: string): Promise<void> {
  if (await pathExists(filePath)) {
    return;
  }

  await fs.writeFile(filePath, `${header}\n`, "utf8");
}

async function ensurePlanScaffold(paths: IssueRuntimePaths, issue: GitHubIssue): Promise<void> {
  if (await pathExists(paths.planPath)) {
    return;
  }

  const initialPlan = {
    issueNumber: issue.number,
    issueTitle: issue.title,
    branchName: paths.branchName,
    decision: "pending",
    productIntent: "",
    chosenApproach: "",
    acceptanceCriteria: [],
    qualityChecks: [],
    humanHandoff: {
      required: false,
      instructions: ""
    },
    updatedAt: new Date().toISOString()
  };

  await fs.writeFile(paths.planPath, `${JSON.stringify(initialPlan, null, 2)}\n`, "utf8");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(command: string, args: string[]): Promise<void> {
  const child = spawn(command, args, { stdio: "ignore" });
  const exitCode = await waitForExit(child);
  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${exitCode}`);
  }
}

async function waitForExit(
  child: ChildProcessWithoutNullStreams | ReturnType<typeof spawn>
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
}

function relativeFromRepo(config: OrchestratorConfig, filePath: string): string {
  return path.relative(config.repoRoot, filePath);
}

function relativeFromWorktree(paths: IssueRuntimePaths, filePath: string): string {
  return path.relative(paths.worktreePath, filePath);
}
