import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { OrchestratorConfig } from "./config";
import type { GitHubIssue } from "./github";
import {
  DEFAULT_AGENT_TOOL,
  describeAgentToolsForPrompt,
  getAgentTool,
  type AgentToolName
} from "./agent-tools";

export interface AgentTestResult {
  command: string;
  status: "passed" | "failed" | "not-run";
}

export type SurfaceSensitivity = "low" | "medium" | "high";
export type EvidenceStrength = "weak" | "moderate" | "strong";

export interface TriageResult {
  issueNumber: number;
  outcome: "reject" | "dispatch" | "bank";
  summary: string;
  issueComment: string | null;
  sensitivity: SurfaceSensitivity;
  evidenceStrength: EvidenceStrength;
  evidenceSummary: string;
  bankReason: string | null;
  toolName: AgentToolName | null;
  toolReason: string | null;
}

export interface HumanHandoff {
  required: boolean;
  instructions: string;
}

export interface DecompositionChildIssue {
  title: string;
  body: string;
}

export interface DecompositionPlan {
  overview: string;
  childIssues: DecompositionChildIssue[];
}

export interface AgentResult {
  issueNumber: number;
  outcome: "accepted" | "rejected" | "retry" | "decomposed";
  summary: string;
  branchName?: string | null;
  prUrl?: string | null;
  issueComment?: string | null;
  nextStep?: string | null;
  humanHandoff?: HumanHandoff | null;
  decomposition?: DecompositionPlan | null;
  tests: AgentTestResult[];
}

export interface RunRecord {
  issueNumber: number;
  issueTitle: string;
  branchName: string;
  agentTool?: AgentToolName;
  sensitivity?: SurfaceSensitivity;
  evidenceStrength?: EvidenceStrength;
  evidenceSummary?: string;
  status: "running" | "accepted" | "rejected" | "retry" | "failed" | "decomposed";
  iteration: number;
  startFailureCount?: number;
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
  triagePromptPath: string;
  triageResultPath: string;
  triageLogPath: string;
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
  startedAt: number;
  parseResult: () => Promise<AgentResult | null>;
}

const RESULT_MARKER = "<!-- openreactor:agent-result -->";

interface MaintainerSteeringSignal {
  username: string;
}

export function issueRuntimePaths(config: OrchestratorConfig, issueNumber: number): IssueRuntimePaths {
  const runDir = path.join(config.runsDir, `issue-${issueNumber}`);
  const worktreePath = path.join(config.worktreesDir, `issue-${issueNumber}`);
  const branchName = `${config.branchPrefix}${issueNumber}`;

  return {
    runDir,
    worktreePath,
    branchName,
    runFilePath: path.join(runDir, "run.json"),
    triagePromptPath: path.join(runDir, "triage.prompt.md"),
    triageResultPath: path.join(runDir, "triage.result.json"),
    triageLogPath: path.join(runDir, "triage.log"),
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
  paths: IssueRuntimePaths,
  governance?: {
    sensitivity?: SurfaceSensitivity;
    evidenceStrength?: EvidenceStrength;
    evidenceSummary?: string;
  }
): Promise<void> {
  const labels = issue.labels.map((label) => label.name).filter(Boolean).join(", ") || "_None_";
  const maintainerSteering = getMaintainerSteeringSignal(config, issue);

  const content = [
    "# Issue Context",
    "",
    `- Issue: #${issue.number}`,
    `- Title: ${issue.title}`,
    `- URL: ${issue.html_url}`,
    `- Labels: ${labels}`,
    `- Branch: ${paths.branchName}`,
    `- Surface sensitivity: ${governance?.sensitivity ?? "unknown"}`,
    `- Evidence strength: ${governance?.evidenceStrength ?? "unknown"}`,
    `- Maintainer steering: ${
      maintainerSteering
        ? `yes (${maintainerSteering.username} matches repo owner ${config.owner})`
        : "no"
    }`,
    governance?.evidenceSummary ? `- Evidence summary: ${governance.evidenceSummary}` : "",
    "",
    "## Issue Body",
    "",
    issue.body ?? "_No body provided._",
    "",
    "## Derived Guidance",
    "",
    maintainerSteering
      ? `- This issue declares GitHub Username \`@${maintainerSteering.username}\`, which matches the repo owner. Agents should treat it as maintainer steering: do not reject it solely for roadmap, product-direction, or constitution-fit reasons, but still enforce safety, legality, secrecy, and feasibility constraints.`
      : "- No maintainer steering signal detected from the structured issue metadata.",
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
    "- PRODUCT_CONSTITUTION.md",
    "- OPENREACTOR_WORKFLOW.md",
    "- ROADMAP.md",
    "- MEMORY.md",
    "- README.md"
  ].filter(Boolean).join("\n");

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
    startFailureCount: 0,
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

export async function listChangedFilesForBranch(
  repoRoot: string,
  branchName: string,
  baseRef = "origin/main"
): Promise<string[]> {
  const output = await runCommandCapture("git", [
    "-C",
    repoRoot,
    "diff",
    "--name-only",
    `${baseRef}...${branchName}`
  ]);

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function spawnIssueAgent(input: {
  config: OrchestratorConfig;
  issue: GitHubIssue;
  paths: IssueRuntimePaths;
  record: RunRecord;
  githubToken: string;
}): Promise<ActiveRun> {
  const tool = getAgentTool(input.record.agentTool);
  if (tool.name === "spawn_codex_planner_agent") {
    return spawnCodexPlannerAgent(input);
  }
  if (tool.provider === "claude") {
    return spawnClaudeUiIssueAgent(input);
  }

  return spawnCodexIssueAgent(input);
}

async function spawnCodexIssueAgent(input: {
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
  const prompt = buildAgentPrompt(config, issue, paths, iteration, "spawn_codex_issue_agent");

  await fs.writeFile(promptPath, prompt, "utf8");

  const args = buildCodexArgs({
    model: config.agentModel,
    reasoningEffort: config.agentReasoningEffort,
    serviceTier: config.agentServiceTier,
    fullAccess: true,
    outputSchemaPath: schemaPath,
    outputPath: resultPath
  });

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
      OPENREACTOR_BRANCH_NAME: paths.branchName,
      AGENT_BROWSER_SESSION: `openreactor-issue-${issue.number}`,
      AGENT_BROWSER_PROFILE: path.join(paths.runDir, "agent-browser-profile"),
      AGENT_BROWSER_DOWNLOAD_PATH: path.join(paths.runDir, "agent-browser-downloads"),
      AGENT_BROWSER_CONTENT_BOUNDARIES: "1",
      AGENT_BROWSER_MAX_OUTPUT: "50000",
      PATH: `${path.join(paths.worktreePath, "node_modules", ".bin")}${path.delimiter}${process.env.PATH ?? ""}`
    },
    stdio: ["pipe", "pipe", "pipe"]
  });

  child.stdin.end(prompt);

  await attachProcessLogging(child, logPath);

  const record: RunRecord = {
    ...input.record,
    agentTool: "spawn_codex_issue_agent",
    status: "running",
    iteration,
    startFailureCount: 0,
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
    logPath,
    startedAt: Date.now(),
    parseResult: () => parseAgentResult(resultPath)
  };
}

async function spawnCodexPlannerAgent(input: {
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
  const prompt = buildAgentPrompt(config, issue, paths, iteration, "spawn_codex_planner_agent");

  await fs.writeFile(promptPath, prompt, "utf8");

  const args = buildCodexArgs({
    model: config.agentModel,
    reasoningEffort: config.agentReasoningEffort,
    serviceTier: config.agentServiceTier,
    fullAccess: true,
    outputSchemaPath: schemaPath,
    outputPath: resultPath
  });

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
      OPENREACTOR_BRANCH_NAME: paths.branchName,
      PATH: `${path.join(paths.worktreePath, "node_modules", ".bin")}${path.delimiter}${process.env.PATH ?? ""}`
    },
    stdio: ["pipe", "pipe", "pipe"]
  });

  child.stdin.end(prompt);

  await attachProcessLogging(child, logPath);

  const record: RunRecord = {
    ...input.record,
    agentTool: "spawn_codex_planner_agent",
    status: "running",
    iteration,
    startFailureCount: 0,
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
    logPath,
    startedAt: Date.now(),
    parseResult: () => parseAgentResult(resultPath)
  };
}

async function spawnClaudeUiIssueAgent(input: {
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
  const prompt = buildAgentPrompt(config, issue, paths, iteration, "spawn_claude_ui_agent");
  const schema = await fs.readFile(schemaPath, "utf8");

  await fs.writeFile(promptPath, prompt, "utf8");

  const args = buildClaudeArgs({
    model: config.claudeUiModel,
    effort: config.claudeUiEffort,
    schema,
    runDir: paths.runDir
  });

  const child = spawn(config.claudeUiBin, args, {
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
      OPENREACTOR_BRANCH_NAME: paths.branchName,
      PATH: `${path.join(paths.worktreePath, "node_modules", ".bin")}${path.delimiter}${process.env.PATH ?? ""}`
    },
    stdio: ["pipe", "pipe", "pipe"]
  });

  child.stdin.end(prompt);

  const stdoutChunks = await attachProcessLogging(child, logPath);

  const record: RunRecord = {
    ...input.record,
    agentTool: "spawn_claude_ui_agent",
    status: "running",
    iteration,
    startFailureCount: 0,
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
    logPath,
    startedAt: Date.now(),
    parseResult: () => parseClaudeAgentResult(stdoutChunks, resultPath)
  };
}

export async function runIssueTriage(input: {
  config: OrchestratorConfig;
  issue: GitHubIssue;
  paths: IssueRuntimePaths;
  githubToken: string;
}): Promise<{ result: TriageResult | null; exitCode: number | null }> {
  const { config, issue, paths, githubToken } = input;
  const schemaPath = path.join(config.repoRoot, "reactor", "triage-result.schema.json");
  const prompt = buildTriagePrompt(config, issue);

  await fs.mkdir(paths.runDir, { recursive: true });
  await fs.writeFile(paths.triagePromptPath, prompt, "utf8");

  const args = buildCodexArgs({
    model: config.triageModel,
    reasoningEffort: config.triageReasoningEffort,
    serviceTier: config.triageServiceTier,
    fullAccess: false,
    outputSchemaPath: schemaPath,
    outputPath: paths.triageResultPath
  });

  const child = spawn("codex", args, {
    cwd: config.repoRoot,
    env: {
      ...process.env,
      GH_TOKEN: githubToken,
      GITHUB_TOKEN: githubToken,
      OPENREACTOR_REPO_OWNER: config.owner,
      OPENREACTOR_REPO_NAME: config.repo,
      OPENREACTOR_ISSUE_NUMBER: String(issue.number),
      OPENREACTOR_ISSUE_URL: issue.html_url,
      OPENREACTOR_RUN_DIR: paths.runDir
    },
    stdio: ["pipe", "pipe", "pipe"]
  });

  child.stdin.end(prompt);

  const logHandle = await fs.open(paths.triageLogPath, "w");
  child.stdout.on("data", (chunk) => {
    void logHandle.appendFile(chunk);
  });
  child.stderr.on("data", (chunk) => {
    void logHandle.appendFile(chunk);
  });
  child.on("close", () => {
    void logHandle.close();
  });

  const exitCode = await waitForExit(child);
  const result = await parseTriageResult(paths.triageResultPath);
  return { result, exitCode };
}

export async function finalizeIssueAgentRun(input: {
  activeRun: ActiveRun;
  paths: IssueRuntimePaths;
}): Promise<{ result: AgentResult | null; exitCode: number | null }> {
  const exitCode = await waitForExit(input.activeRun.process);
  clearInterval(input.activeRun.heartbeatTimer);

  const parsedResult = await input.activeRun.parseResult();
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
  iteration: number,
  agentTool: AgentToolName
): string {
  const tool = getAgentTool(agentTool);
  const maintainerSteering = getMaintainerSteeringSignal(config, issue);
  const extraFiles =
    agentTool === "spawn_claude_ui_agent"
      ? ["- prompts/ui-agent.md"]
      : agentTool === "spawn_codex_planner_agent"
        ? ["- prompts/planner-agent.md"]
        : [];
  const toolRules =
    agentTool === "spawn_claude_ui_agent"
      ? [
          `- This issue was dispatched via ${tool.label}. Treat it as a UI-heavy task unless the code proves otherwise.`,
          "- Use prompts/ui-agent.md as your frontend design skill equivalent while making design decisions.",
          "- Prefer tight, polished UI work over broad refactors when solving the issue."
        ]
      : agentTool === "spawn_codex_planner_agent"
        ? [
            `- This issue was dispatched via ${tool.label}. Your primary job is to decide whether the request should be decomposed into multiple smaller issues instead of being implemented directly.`,
            "- Use prompts/planner-agent.md as the planning-specific rule set for this run.",
            "- If the request is worth pursuing but too large, return `decomposed` with a structured decomposition plan instead of `rejected`.",
            "- Do not open a PR for the oversized parent issue itself."
          ]
      : [
          `- This issue was dispatched via ${tool.label}. Handle it as the general-purpose implementation path.`
        ];

  return [
    `You are OpenReactor's autonomous issue agent for GitHub issue #${issue.number}.`,
    "",
    "Read these files before doing anything else:",
    "- UI_SYSTEM.md",
    "- prompts/product-context.md",
    "- prompts/issue-agent.md",
    "- prompts/quality-gates.md",
    "- PRODUCT_CONSTITUTION.md",
    "- OPENREACTOR_WORKFLOW.md",
    ...extraFiles,
    `- ${relativeFromWorktree(paths, paths.contextPath)}`,
    `- ${relativeFromWorktree(paths, paths.planPath)}`,
    `- ${relativeFromWorktree(paths, paths.progressPath)}`,
    `- ${relativeFromWorktree(paths, paths.tasksPath)}`,
    "",
    "Execution context:",
    `- Iteration: ${iteration}`,
    `- Issue URL: ${issue.html_url}`,
    `- Run directory: ${paths.runDir}`,
    `- Branch to use: ${paths.branchName}`,
    `- Maintainer steering: ${maintainerSteering ? `yes (@${maintainerSteering.username})` : "no"}`,
    "",
    "Rules for this run:",
    "- Stay on the current branch. Do not create a different branch name.",
    "- Treat the issue as product feedback, not a binding specification.",
    "- You may reject the request if that is better for the product.",
    "- If accepted, you may reinterpret the request and implement the best product change.",
    "- If a request carries a valid product signal through an overly rigid numeric target, hard cap, or absolute rule, do not reject it on that basis alone.",
    "- For directionally sound requests, prefer the smallest useful accepted change that addresses the concern and explain the softened interpretation clearly.",
    "- If you touch rendered UI, browser verification is mandatory before returning accepted.",
    ...toolRules,
    "- A starter plan.json already exists. Update it instead of replacing it with a different shape.",
    "- Append progress to progress.md before finishing.",
    "- If you discover durable learnings, update the relevant shared docs in prompts/, MEMORY.md, CONSTITUTION.md, PRODUCT_CONSTITUTION.md, OPENREACTOR_WORKFLOW.md, or nearby docs.",
    "- Never commit secrets, API keys, private tokens, or credentials.",
    "- Use gh for GitHub issue and PR operations. GH_TOKEN is already available.",
    "- Use `bun run reactor:tool ensure-plan ...` if the plan scaffold needs to be restored.",
    "- Use `bun run reactor:tool ensure-pr ...` when finishing an accepted run so PR creation is idempotent.",
    `- Keep the claim label ${config.runningLabel} in place if more iterations are needed.`,
    `- If you finish with accepted or rejected, remove ${config.runningLabel} yourself and apply the final label.`,
    "- If you return accepted, the reactor will verify that a remote branch exists, a PR exists for the branch, at least one reported check passed, and no reported checks failed.",
    "- If you are repairing an open conflicted PR, fetch origin, merge or rebase from origin/main, resolve conflicts in the current branch, rerun checks, and update the same PR instead of opening a replacement.",
    "- Never recreate or reopen a PR that is already merged. Auto-healing only applies to the still-open PR on the issue branch.",
    "- If human action is required, prepare a clean handoff with exact instructions and do not pretend the task is fully complete.",
    ...(maintainerSteering
      ? [
          "- This issue is maintainer steering because the structured GitHub Username matches the repo owner.",
          "- Do not reject it solely for roadmap fit, current product direction, constitution-fit, or because it asks for a more drastic product change than normal intake requests.",
          "- Still enforce hard safety rules, legality, secret handling, and realistic human-handoff constraints."
        ]
      : []),
    "",
    "Return only JSON matching the provided output schema.",
    "",
    RESULT_MARKER
  ].join("\n");
}

function buildTriagePrompt(config: OrchestratorConfig, issue: GitHubIssue): string {
  const maintainerSteering = getMaintainerSteeringSignal(config, issue);
  const labels = issue.labels.map((label) => label.name).filter(Boolean).join(", ") || "_None_";
  return [
    `You are OpenReactor's lightweight issue triage agent for GitHub issue #${issue.number}.`,
    "",
    "Read these files before deciding:",
    "- prompts/triage-agent.md",
    "- prompts/product-context.md",
    "- prompts/issue-agent.md",
    "- CONSTITUTION.md",
    "- PRODUCT_CONSTITUTION.md",
    "- OPENREACTOR_WORKFLOW.md",
    "- ROADMAP.md",
    "",
    "Issue context:",
    `- Issue: #${issue.number}`,
    `- Title: ${issue.title}`,
    `- URL: ${issue.html_url}`,
    `- Maintainer steering: ${maintainerSteering ? `yes (@${maintainerSteering.username})` : "no"}`,
    `- Labels: ${labels}`,
    "",
    "Issue body:",
    issue.body?.trim() || "_No body provided._",
    "",
    "Your job:",
    "- Classify the likely surface sensitivity of the request as `low`, `medium`, or `high`.",
    "- Classify the current evidence strength for making the change now as `weak`, `moderate`, or `strong`.",
    "- Use `low` sensitivity for side pages, isolated experiments, and narrow reversible features.",
    "- Use `medium` sensitivity for shared UI patterns, navigation, and important but non-defining flows.",
    "- Use `high` sensitivity for homepage identity, brand voice, core UX framing, reactor behavior, deployment-critical surfaces, and privileged internal/admin capabilities.",
    "- Reject only if the issue is clearly out of bounds, clearly lacks a real task, or is clearly unsafe.",
    "- Bank for later when the direction seems potentially good but should not be acted on yet because evidence is weak for the sensitivity level, timing is wrong, or the request should accumulate more supporting feedback first.",
    "- Dispatch anything plausible, ambiguous, weird-but-harmless, or potentially valuable when the evidence is strong enough for the likely sensitivity.",
    "- Bias toward dispatching a tool during OpenReactor's early identity-forming stage, especially for low-sensitivity experiments.",
    "- Treat admin or privileged internal changes as high sensitivity. Unless maintainer steering is explicit, do not dispatch those from random public feedback.",
    ...(maintainerSteering
      ? [
          "- This issue is maintainer steering because the structured GitHub Username matches the repo owner.",
          "- Do not reject or bank it solely for roadmap fit, product-direction fit, or constitution-fit concerns. Dispatch an implementation tool unless a hard safety or feasibility blocker is obvious."
        ]
      : []),
    "- Do not perform implementation work, open PRs, or mutate files.",
    "",
    "Available implementation tools:",
    describeAgentToolsForPrompt(),
    "",
    "Return only JSON matching the provided output schema."
  ].join("\n");
}

function getMaintainerSteeringSignal(
  config: Pick<OrchestratorConfig, "owner">,
  issue: Pick<GitHubIssue, "body">
): MaintainerSteeringSignal | null {
  const username = normalizeGitHubUsername(readStructuredIssueField(issue.body, "GitHub Username"));
  if (!username) {
    return null;
  }

  return username.toLowerCase() === config.owner.toLowerCase() ? { username } : null;
}

function readStructuredIssueField(body: string | null | undefined, field: string): string | null {
  if (!body) {
    return null;
  }

  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`^## ${escapedField}\\s*\\n([\\s\\S]*?)(?=\\n## \\S|$)`, "m"));
  return match?.[1]?.trim() ?? null;
}

function normalizeGitHubUsername(value: string | null): string | null {
  const cleaned = (value ?? "")
    .trim()
    .replace(/^_+|_+$/g, "")
    .replace(/^@/, "")
    .trim();

  if (!cleaned || /^not provided$/i.test(cleaned) || /^anonymous$/i.test(cleaned)) {
    return null;
  }

  return cleaned;
}


async function parseAgentResult(resultPath: string): Promise<AgentResult | null> {
  try {
    const raw = await fs.readFile(resultPath, "utf8");
    return JSON.parse(raw) as AgentResult;
  } catch {
    return null;
  }
}

async function parseTriageResult(resultPath: string): Promise<TriageResult | null> {
  try {
    const raw = await fs.readFile(resultPath, "utf8");
    return JSON.parse(raw) as TriageResult;
  } catch {
    return null;
  }
}

async function parseClaudeAgentResult(
  stdoutChunks: string[],
  resultPath: string
): Promise<AgentResult | null> {
  try {
    const raw = stdoutChunks.join("").trim();
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as { structured_output?: AgentResult };
    if (!parsed.structured_output) {
      return null;
    }

    await fs.writeFile(resultPath, `${JSON.stringify(parsed.structured_output, null, 2)}\n`, "utf8");
    return parsed.structured_output;
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

async function runCommandCapture(command: string, args: string[]): Promise<string> {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "ignore"]
  });

  let stdout = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  const exitCode = await waitForExit(child);
  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${exitCode}`);
  }

  return stdout;
}

async function attachProcessLogging(
  child: ChildProcessWithoutNullStreams,
  logPath: string
): Promise<string[]> {
  const stdoutChunks: string[] = [];
  const logHandle = await fs.open(logPath, "w");

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdoutChunks.push(text);
    void logHandle.appendFile(text);
  });
  child.stderr.on("data", (chunk) => {
    void logHandle.appendFile(chunk);
  });
  child.on("close", () => {
    void logHandle.close();
  });

  return stdoutChunks;
}

function buildCodexArgs(input: {
  model: string;
  reasoningEffort: string;
  serviceTier: string;
  fullAccess: boolean;
  outputSchemaPath: string;
  outputPath: string;
}): string[] {
  const args = [
    "-m",
    input.model,
    "-c",
    `model_reasoning_effort="${input.reasoningEffort}"`
  ];

  if (input.serviceTier) {
    args.push("-c", `service_tier="${input.serviceTier}"`);
  }

  if (input.fullAccess) {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  } else {
    args.push("-a", "never", "-s", "read-only");
  }

  args.push(
    "exec",
    "-",
    "--skip-git-repo-check",
    "--output-schema",
    input.outputSchemaPath,
    "-o",
    input.outputPath
  );

  return args;
}

function buildClaudeArgs(input: {
  model: string;
  effort: string;
  schema: string;
  runDir: string;
}): string[] {
  return [
    "-p",
    "--model",
    input.model,
    "--effort",
    input.effort,
    "--output-format",
    "json",
    "--json-schema",
    input.schema,
    "--permission-mode",
    "bypassPermissions",
    "--add-dir",
    input.runDir
  ];
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
