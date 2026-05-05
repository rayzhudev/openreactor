import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { resolveDefaultBranch, type OrchestratorConfig } from "./config";
import type { GitHubIssue, GitHubIssueComment } from "./github";
import { resolveRepoDocumentationPaths } from "./repo-state";
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
export type ProductSurfaceTarget = "main" | "playground" | "openreactor-core";
export type RequestAuthority = "steering" | "feedback";

export interface TriageResult {
  issueNumber: number;
  outcome: "reject" | "dispatch" | "bank";
  summary: string;
  issueComment: string | null;
  considerations: string[];
  targetSurface: ProductSurfaceTarget;
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
  dependsOn: number[];
}

export interface DecompositionPlan {
  overview: string;
  childIssues: DecompositionChildIssue[];
}

export interface AgentResult {
  issueNumber: number;
  outcome: "accepted" | "rejected" | "retry" | "decomposed";
  summary: string;
  considerations: string[];
  branchName?: string | null;
  prUrl?: string | null;
  issueComment?: string | null;
  nextStep?: string | null;
  humanHandoff?: HumanHandoff | null;
  decomposition?: DecompositionPlan | null;
  tests: AgentTestResult[];
}

export interface ExecutionMetadata {
  stage: "triage" | "implementation";
  providerKey: "codex" | "claude";
  providerLabel: string;
  model: string;
  reasoningEffort: string;
  serviceTier: string | null;
  toolName?: AgentToolName | null;
  toolLabel?: string | null;
  primaryUse?: "general" | "planning" | "ui" | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export interface RunRecord {
  issueNumber: number;
  issueTitle: string;
  branchName: string;
  agentTool?: AgentToolName;
  preferredAgentTool?: AgentToolName;
  providerFallbackToolsTried?: AgentToolName[];
  requestAuthority?: RequestAuthority;
  steeringUsername?: string | null;
  targetSurface?: ProductSurfaceTarget;
  sensitivity?: SurfaceSensitivity;
  evidenceStrength?: EvidenceStrength;
  evidenceSummary?: string;
  status:
    | "running"
    | "banked"
    | "accepted"
    | "rejected"
    | "retry"
    | "failed"
    | "decomposed"
    | "waiting-maintainer";
  iteration: number;
  startFailureCount?: number;
  createdAt: string;
  updatedAt: string;
  lastHeartbeatAt: string;
  lastDiscussionCommentAt?: string;
  triageExecution?: ExecutionMetadata | null;
  lastAgentExecution?: ExecutionMetadata | null;
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
  referenceImagesDir: string;
  uiDesignPromptPath: string;
  uiDesignLogPath: string;
  uiDesignBriefPath: string;
  uiDesignImagePath: string;
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
  executionTemplate: {
    providerKey: "codex" | "claude";
    providerLabel: string;
    model: string;
    reasoningEffort: string;
    serviceTier: string | null;
    toolName: AgentToolName;
    toolLabel: string;
    primaryUse: "general" | "planning" | "ui";
  };
  parseResult: () => Promise<AgentResult | null>;
}

const RESULT_MARKER = "<!-- openreactor:agent-result -->";

interface MaintainerSteeringSignal {
  username: string;
  source: "issue-author" | "trusted-label";
}

interface TrustedSubmitterSignal {
  username: string;
  source: "issue-author" | "trusted-label";
}

export interface RunReferenceImage {
  sourceUrl: string;
  localPath: string;
  source: "issue-body" | "discussion";
  sourceLabel: string;
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
    referenceImagesDir: path.join(runDir, "reference-images"),
    uiDesignPromptPath: path.join(runDir, "ui-design-prepass.prompt.md"),
    uiDesignLogPath: path.join(runDir, "ui-design-prepass.log"),
    uiDesignBriefPath: path.join(runDir, "ui-design-brief.md"),
    uiDesignImagePath: path.join(runDir, "ui-design-reference.svg"),
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
    requestAuthority?: RequestAuthority;
    steeringUsername?: string | null;
    targetSurface?: ProductSurfaceTarget;
    sensitivity?: SurfaceSensitivity;
    evidenceStrength?: EvidenceStrength;
    evidenceSummary?: string;
  },
  discussionComments: GitHubIssueComment[] = []
): Promise<RunReferenceImage[]> {
  const labels = issue.labels.map((label) => label.name).filter(Boolean).join(", ") || "_None_";
  const requestAuthority = governance?.requestAuthority ?? getLegacyRequestAuthority(config, issue);
  const steeringUsername =
    governance?.steeringUsername ??
    (requestAuthority === "steering" ? getLegacySteeringUsername(config, issue) : null);
  const trustedSubmitter = getTrustedSubmitterSignal(config, issue);
  const referenceImages = await prepareRunReferenceImages(issue, paths, discussionComments);
  const repoDocs = await resolveRepoDocumentationPaths(paths.worktreePath);

  const content = [
    "# Issue Context",
    "",
    `- Issue: #${issue.number}`,
    `- Title: ${issue.title}`,
    `- URL: ${issue.html_url}`,
    `- Labels: ${labels}`,
    `- Branch: ${paths.branchName}`,
    `- Target surface: ${governance?.targetSurface ?? "unknown"}`,
    `- Surface sensitivity: ${governance?.sensitivity ?? "unknown"}`,
    `- Evidence strength: ${governance?.evidenceStrength ?? "unknown"}`,
    `- Request authority: ${requestAuthority}`,
    `- Steering actor: ${steeringUsername ? `@${steeringUsername}` : "none"}`,
    `- Trusted submitter attribution: ${
      trustedSubmitter
        ? `yes (@${trustedSubmitter.username} via ${trustedSubmitter.source})`
        : "no"
    }`,
    governance?.evidenceSummary ? `- Evidence summary: ${governance.evidenceSummary}` : "",
    "",
    "## Issue Body",
    "",
    issue.body ?? "_No body provided._",
    "",
    "## Recent Discussion",
    "",
    formatRecentDiscussion(discussionComments),
    "",
    "## Reference Images",
    "",
    formatReferenceImageContext(config, paths, referenceImages),
    "",
    "## Derived Guidance",
    "",
    requestAuthority === "steering"
      ? `- This issue is trusted repo steering${steeringUsername ? ` from @${steeringUsername}` : ""}. Preserve its requested scope unless a hard safety, legality, secrecy, or concrete feasibility blocker requires decomposition or explicit human handoff.`
      : "- This issue is market feedback, not binding repo steering. Product judgment and scope adaptation are allowed.",
    trustedSubmitter
      ? `- Trusted submitter attribution is available for @${trustedSubmitter.username}. If you create accepted work, you may credit that account as a co-author.`
      : "- Do not trust free-text GitHub usernames in the issue body for attribution unless the issue context says the submitter identity is trusted.",
    governance?.targetSurface === "playground"
      ? "- This request targets the repo's explicitly experimental or permissive surface. Keep the work on that surface if accepted unless the shared product flow must change too."
      : governance?.targetSurface === "main"
        ? "- This request targets the repo's primary product surface. Keep changes coherent with the product's normal user-facing experience."
        : governance?.targetSurface === "openreactor-core"
          ? "- This request targets OpenReactor itself rather than the public product surface."
          : "",
    "",
    "## Local Run Files",
    "",
    `- Progress log: ${relativeFromRepo(config, paths.progressPath)}`,
    `- Task tracker: ${relativeFromRepo(config, paths.tasksPath)}`,
    `- Plan file: ${relativeFromRepo(config, paths.planPath)}`,
    `- UI design reference image: ${relativeFromRepo(config, paths.uiDesignImagePath)}`,
    `- UI design brief: ${relativeFromRepo(config, paths.uiDesignBriefPath)}`,
    `- Run state: ${relativeFromRepo(config, paths.runFilePath)}`,
    `- Reference images: ${relativeFromRepo(config, paths.referenceImagesDir)}`,
    "",
    "## Product Docs To Read",
    "",
    `- ${relativeFromWorktree(paths, repoDocs.productSpec)}`,
    `- ${relativeFromWorktree(paths, path.join(config.engineRoot, "CONSTITUTION.md"))}`,
    `- ${relativeFromWorktree(paths, repoDocs.productConstitution)}`,
    ...(repoDocs.triagePolicy ? [`- ${relativeFromWorktree(paths, repoDocs.triagePolicy)}`] : []),
    `- ${relativeFromWorktree(paths, path.join(config.engineRoot, "OPENREACTOR_WORKFLOW.md"))}`,
    `- ${relativeFromWorktree(paths, path.join(config.engineRoot, "STACK_WORKFLOWS.md"))}`,
    `- ${relativeFromWorktree(paths, repoDocs.roadmap)}`,
    `- ${relativeFromWorktree(paths, repoDocs.memory)}`,
    `- ${relativeFromWorktree(paths, repoDocs.readme)}`
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

  return referenceImages;
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
    requestAuthority: "feedback",
    steeringUsername: null,
    status: "running",
    iteration: 0,
    startFailureCount: 0,
    createdAt: now,
    updatedAt: now,
    lastHeartbeatAt: now,
    triageExecution: null,
    lastAgentExecution: null,
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

  await refreshOriginDefaultBranch(config.repoRoot, config.defaultBranch);

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
    `origin/${config.defaultBranch}`
  ]);
}

async function refreshOriginDefaultBranch(repoRoot: string, defaultBranch: string): Promise<void> {
  await runCommand("git", ["-C", repoRoot, "fetch", "--prune", "origin", defaultBranch]);
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
  baseRef = `origin/${resolveDefaultBranch(repoRoot)}`
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
  referenceImages?: RunReferenceImage[];
}): Promise<ActiveRun> {
  const tool = getAgentTool(input.record.agentTool);
  if (tool.name === "spawn_codex_planner_agent") {
    return spawnCodexPlannerAgent(input);
  }
  if (tool.name === "spawn_claude_planner_agent") {
    return spawnClaudePlannerAgent(input);
  }
  if (tool.name === "spawn_claude_issue_agent") {
    return spawnClaudeIssueAgent(input);
  }
  if (tool.name === "spawn_codex_ui_agent") {
    return spawnCodexUiIssueAgent(input);
  }

  return spawnCodexIssueAgent(input);
}

interface CodexAgentSpawnOptions {
  toolName: AgentToolName;
  model: string;
  reasoningEffort: string;
  serviceTier: string;
  imagePaths?: string[];
}

async function spawnCodexIssueAgent(input: {
  config: OrchestratorConfig;
  issue: GitHubIssue;
  paths: IssueRuntimePaths;
  record: RunRecord;
  githubToken: string;
  referenceImages?: RunReferenceImage[];
}): Promise<ActiveRun> {
  return spawnCodexAgent(input, {
    toolName: "spawn_codex_issue_agent",
    model: input.config.agentModel,
    reasoningEffort: input.config.agentReasoningEffort,
    serviceTier: input.config.agentServiceTier,
    imagePaths: input.referenceImages?.map((image) => image.localPath)
  });
}

async function spawnCodexPlannerAgent(input: {
  config: OrchestratorConfig;
  issue: GitHubIssue;
  paths: IssueRuntimePaths;
  record: RunRecord;
  githubToken: string;
  referenceImages?: RunReferenceImage[];
}): Promise<ActiveRun> {
  return spawnCodexAgent(input, {
    toolName: "spawn_codex_planner_agent",
    model: input.config.plannerModel,
    reasoningEffort: input.config.plannerReasoningEffort,
    serviceTier: input.config.plannerServiceTier,
    imagePaths: input.referenceImages?.map((image) => image.localPath)
  });
}

async function spawnCodexUiIssueAgent(input: {
  config: OrchestratorConfig;
  issue: GitHubIssue;
  paths: IssueRuntimePaths;
  record: RunRecord;
  githubToken: string;
  referenceImages?: RunReferenceImage[];
}): Promise<ActiveRun> {
  const designImagePaths = await prepareCodexUiDesignReference(input);
  return spawnCodexAgent(input, {
    toolName: "spawn_codex_ui_agent",
    model: input.config.codexUiModel,
    reasoningEffort: input.config.codexUiReasoningEffort,
    serviceTier: input.config.codexUiServiceTier,
    imagePaths: [
      ...designImagePaths,
      ...(input.referenceImages?.map((image) => image.localPath) ?? [])
    ]
  });
}

async function spawnCodexAgent(
  input: {
    config: OrchestratorConfig;
    issue: GitHubIssue;
    paths: IssueRuntimePaths;
    record: RunRecord;
    githubToken: string;
    referenceImages?: RunReferenceImage[];
  },
  options: CodexAgentSpawnOptions
): Promise<ActiveRun> {
  const { config, issue, paths, githubToken } = input;
  const iteration = input.record.iteration + 1;
  const schemaPath = path.join(config.engineRoot, "reactor", "agent-result.schema.json");
  const resultPath = path.join(paths.runDir, `iteration-${iteration}.result.json`);
  const logPath = path.join(paths.runDir, `iteration-${iteration}.log`);
  const promptPath = path.join(paths.runDir, `iteration-${iteration}.prompt.md`);
  const prompt = await buildAgentPrompt(
    config,
    issue,
    paths,
    iteration,
    options.toolName,
    input.record.requestAuthority ?? "feedback",
    input.record.steeringUsername ?? null
  );

  await fs.writeFile(promptPath, prompt, "utf8");

  const args = buildCodexArgs({
    model: options.model,
    reasoningEffort: options.reasoningEffort,
    serviceTier: options.serviceTier,
    fullAccess: true,
    outputSchemaPath: schemaPath,
    outputPath: resultPath,
    imagePaths: options.imagePaths
  });

  const child = spawn("codex", args, {
    cwd: paths.worktreePath,
    env: buildAgentEnv(config, issue, paths, githubToken),
    stdio: ["pipe", "pipe", "pipe"]
  });

  child.stdin.end(prompt);

  await attachProcessLogging(child, logPath);

  const record: RunRecord = {
    ...input.record,
    agentTool: options.toolName,
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
    executionTemplate: {
      providerKey: "codex",
      providerLabel: providerLabelFor("codex"),
      model: options.model,
      reasoningEffort: options.reasoningEffort,
      serviceTier: options.serviceTier || null,
      toolName: options.toolName,
      toolLabel: getAgentTool(options.toolName).label,
      primaryUse: getAgentTool(options.toolName).primaryUse
    },
    parseResult: () => parseAgentResult(resultPath)
  };
}

async function prepareCodexUiDesignReference(input: {
  config: OrchestratorConfig;
  issue: GitHubIssue;
  paths: IssueRuntimePaths;
  record: RunRecord;
  githubToken: string;
  referenceImages?: RunReferenceImage[];
}): Promise<string[]> {
  const { config, issue, paths, githubToken } = input;
  await fs.mkdir(paths.runDir, { recursive: true });

  const prompt = await buildUiDesignPrepassPrompt(
    config,
    issue,
    paths,
    input.record,
    input.referenceImages ?? []
  );
  await fs.writeFile(paths.uiDesignPromptPath, prompt, "utf8");

  const child = spawn("codex", buildCodexExecArgs({
    model: config.uiDesignModel,
    reasoningEffort: config.uiDesignReasoningEffort,
    serviceTier: config.uiDesignServiceTier,
    fullAccess: true,
    imagePaths: input.referenceImages?.map((image) => image.localPath)
  }), {
    cwd: paths.worktreePath,
    env: buildAgentEnv(config, issue, paths, githubToken, {
      OPENREACTOR_UI_DESIGN_IMAGE_PATH: paths.uiDesignImagePath,
      OPENREACTOR_UI_DESIGN_BRIEF_PATH: paths.uiDesignBriefPath
    }),
    stdio: ["pipe", "pipe", "pipe"]
  });

  child.stdin.end(prompt);
  await attachProcessLogging(child, paths.uiDesignLogPath);

  const exitCode = await waitForExit(child);
  if (exitCode !== 0) {
    throw new Error(`Codex UI design prepass exited with code ${exitCode ?? "unknown"}`);
  }

  const imageExists = await pathExists(paths.uiDesignImagePath);
  const briefExists = await pathExists(paths.uiDesignBriefPath);
  if (!imageExists || !briefExists) {
    throw new Error(
      [
        "Codex UI design prepass did not produce the required artifacts.",
        imageExists ? "" : `Missing image: ${paths.uiDesignImagePath}`,
        briefExists ? "" : `Missing brief: ${paths.uiDesignBriefPath}`
      ].filter(Boolean).join(" ")
    );
  }

  return [paths.uiDesignImagePath];
}

async function spawnClaudeIssueAgent(input: {
  config: OrchestratorConfig;
  issue: GitHubIssue;
  paths: IssueRuntimePaths;
  record: RunRecord;
  githubToken: string;
}): Promise<ActiveRun> {
  return spawnClaudeAgent(input, "spawn_claude_issue_agent");
}

async function spawnClaudePlannerAgent(input: {
  config: OrchestratorConfig;
  issue: GitHubIssue;
  paths: IssueRuntimePaths;
  record: RunRecord;
  githubToken: string;
}): Promise<ActiveRun> {
  return spawnClaudeAgent(input, "spawn_claude_planner_agent");
}

async function spawnClaudeAgent(
  input: {
    config: OrchestratorConfig;
    issue: GitHubIssue;
    paths: IssueRuntimePaths;
    record: RunRecord;
    githubToken: string;
  },
  toolName: AgentToolName
): Promise<ActiveRun> {
  const { config, issue, paths, githubToken } = input;
  const iteration = input.record.iteration + 1;
  const schemaPath = path.join(config.engineRoot, "reactor", "agent-result.schema.json");
  const resultPath = path.join(paths.runDir, `iteration-${iteration}.result.json`);
  const logPath = path.join(paths.runDir, `iteration-${iteration}.log`);
  const promptPath = path.join(paths.runDir, `iteration-${iteration}.prompt.md`);
  const prompt = await buildAgentPrompt(
    config,
    issue,
    paths,
    iteration,
    toolName,
    input.record.requestAuthority ?? "feedback",
    input.record.steeringUsername ?? null
  );
  const schema = await fs.readFile(schemaPath, "utf8");

  await fs.writeFile(promptPath, prompt, "utf8");

  const args = buildClaudeArgs({
    model: config.claudeModel,
    effort: config.claudeEffort,
    schema,
    runDir: paths.runDir
  });

  const child = spawn(config.claudeBin, args, {
    cwd: paths.worktreePath,
    env: buildAgentEnv(config, issue, paths, githubToken),
    stdio: ["pipe", "pipe", "pipe"]
  });

  child.stdin.end(prompt);

  const stdoutChunks = await attachProcessLogging(child, logPath);

  const record: RunRecord = {
    ...input.record,
    agentTool: toolName,
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
    executionTemplate: {
      providerKey: "claude",
      providerLabel: providerLabelFor("claude"),
      model: config.claudeModel,
      reasoningEffort: config.claudeEffort,
      serviceTier: null,
      toolName,
      toolLabel: getAgentTool(toolName).label,
      primaryUse: getAgentTool(toolName).primaryUse
    },
    parseResult: () => parseClaudeAgentResult(stdoutChunks, resultPath)
  };
}

export async function runIssueTriage(input: {
  config: OrchestratorConfig;
  issue: GitHubIssue;
  paths: IssueRuntimePaths;
  githubToken: string;
  comments?: GitHubIssueComment[];
  requestAuthority?: RequestAuthority;
  steeringUsername?: string | null;
}): Promise<{ result: TriageResult | null; exitCode: number | null; execution: ExecutionMetadata }> {
  const { config, issue, paths, githubToken } = input;
  const schemaPath = path.join(config.engineRoot, "reactor", "triage-result.schema.json");
  const prompt = await buildTriagePrompt(
    config,
    issue,
    paths,
    input.comments ?? [],
    input.requestAuthority ?? getLegacyRequestAuthority(config, issue),
    input.steeringUsername ?? getLegacySteeringUsername(config, issue)
  );
  const referenceImages = await prepareRunReferenceImages(issue, paths, input.comments ?? []);

  await fs.mkdir(paths.runDir, { recursive: true });
  await fs.writeFile(paths.triagePromptPath, prompt, "utf8");

  const args = buildCodexArgs({
    model: config.triageModel,
    reasoningEffort: config.triageReasoningEffort,
    serviceTier: config.triageServiceTier,
    fullAccess: false,
    outputSchemaPath: schemaPath,
    outputPath: paths.triageResultPath,
    imagePaths: referenceImages.map((image) => image.localPath)
  });

  const startedAt = new Date().toISOString();
  const startTimeMs = Date.now();
  const child = spawn("codex", args, {
    cwd: config.repoRoot,
    env: {
      ...process.env,
      ...(config.workspacePolicy.env ?? {}),
      GH_TOKEN: githubToken,
      GITHUB_TOKEN: githubToken,
      OPENREACTOR_REPO_OWNER: config.owner,
      OPENREACTOR_REPO_NAME: config.repo,
      OPENREACTOR_ENGINE_ROOT: config.engineRoot,
      OPENREACTOR_ENGINE_TOOL: path.join(config.engineRoot, "reactor", "tool.ts"),
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
  return {
    result,
    exitCode,
    execution: {
      stage: "triage",
      providerKey: "codex",
      providerLabel: providerLabelFor("codex"),
      model: config.triageModel,
      reasoningEffort: config.triageReasoningEffort,
      serviceTier: config.triageServiceTier ?? null,
      toolName: null,
      toolLabel: null,
      primaryUse: null,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTimeMs
    }
  };
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
  input.activeRun.record.lastAgentExecution = buildExecutionMetadata(
    input.activeRun.executionTemplate,
    input.activeRun.startedAt,
    Date.now()
  );
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

async function buildUiDesignPrepassPrompt(
  config: OrchestratorConfig,
  issue: GitHubIssue,
  paths: IssueRuntimePaths,
  record: RunRecord,
  referenceImages: RunReferenceImage[]
): Promise<string> {
  const repoDocs = await resolveRepoDocumentationPaths(paths.worktreePath);
  const uiSystemPath = repoDocs.uiSystem ?? path.join(config.engineRoot, "UI_SYSTEM.md");

  return [
    `You are OpenReactor's Codex UI design prepass for GitHub issue #${issue.number}.`,
    "",
    "Your output will be fed as an image attachment into the frontend implementation agent. Spend the reasoning budget on product interpretation, visual hierarchy, responsive behavior, and concrete UI states before creating the artifact.",
    "",
    "Read these files first:",
    `- ${relativeFromWorktree(paths, uiSystemPath)}`,
    `- ${relativeFromWorktree(paths, path.join(config.engineRoot, "prompts", "product-context.md"))}`,
    `- ${relativeFromWorktree(paths, path.join(config.engineRoot, "prompts", "ui-agent.md"))}`,
    `- ${relativeFromWorktree(paths, path.join(config.engineRoot, "STACK_WORKFLOWS.md"))}`,
    `- ${relativeFromWorktree(paths, repoDocs.productSpec)}`,
    `- ${relativeFromWorktree(paths, repoDocs.productConstitution)}`,
    `- ${relativeFromWorktree(paths, repoDocs.roadmap)}`,
    `- ${relativeFromWorktree(paths, repoDocs.memory)}`,
    `- ${relativeFromWorktree(paths, repoDocs.readme)}`,
    `- ${relativeFromWorktree(paths, paths.contextPath)}`,
    "",
    "Issue context:",
    `- Issue URL: ${issue.html_url}`,
    `- Title: ${issue.title}`,
    `- Request authority: ${record.requestAuthority ?? "feedback"}`,
    `- Target surface: ${record.targetSurface ?? "unknown"}`,
    `- Sensitivity: ${record.sensitivity ?? "unknown"}`,
    "",
    "Reference images already attached to the issue:",
    formatReferenceImageContext(config, paths, referenceImages),
    "",
    "Create these exact artifacts:",
    `- Image: ${paths.uiDesignImagePath}`,
    `- Brief: ${paths.uiDesignBriefPath}`,
    "",
    "Image artifact requirements:",
    "- Write a single self-contained SVG image file. It should be a concrete product screen or flow state, not a moodboard.",
    "- Show the layout, hierarchy, navigation, primary and secondary actions, component density, and relevant empty/loading/error states where they affect the implementation.",
    "- Include exact visible labels when they materially affect implementation, and keep all text legible.",
    "- Respect existing product constraints and UI system rules. If issue reference images conflict with your generated direction, the issue reference images win.",
    "- Do not use external image URLs, secrets, private tokens, or brand assets that are not already present in the repo.",
    "",
    "Brief requirements:",
    "- Summarize the product intent, target screen/state, key layout decisions, responsive behavior, and interaction states.",
    "- List implementation acceptance criteria the frontend agent should verify in browser.",
    "- Call out any repo constraints or uncertainties the implementation agent should resolve in code.",
    "",
    "Do not edit product code, docs, tests, package files, git state, or GitHub. Only create or overwrite the two design artifacts above."
  ].join("\n");
}

async function buildAgentPrompt(
  config: OrchestratorConfig,
  issue: GitHubIssue,
  paths: IssueRuntimePaths,
  iteration: number,
  agentTool: AgentToolName,
  requestAuthority: RequestAuthority,
  steeringUsername: string | null
): Promise<string> {
  const tool = getAgentTool(agentTool);
  const trustedSubmitter = getTrustedSubmitterSignal(config, issue);
  const repoDocs = await resolveRepoDocumentationPaths(paths.worktreePath);
  const extraFiles =
    agentTool === "spawn_codex_ui_agent"
      ? [`- ${relativeFromWorktree(paths, path.join(config.engineRoot, "prompts", "ui-agent.md"))}`]
      : agentTool === "spawn_codex_planner_agent" || agentTool === "spawn_claude_planner_agent"
        ? [`- ${relativeFromWorktree(paths, path.join(config.engineRoot, "prompts", "planner-agent.md"))}`]
        : [];
  const toolRules =
    agentTool === "spawn_codex_ui_agent"
      ? [
          `- This issue was dispatched via ${tool.label}. Treat it as a UI-heavy task unless the code proves otherwise.`,
          `- Use ${relativeFromWorktree(paths, path.join(config.engineRoot, "prompts", "ui-agent.md"))} as your frontend design skill equivalent while making design decisions.`,
          `- Inspect the generated design reference image at ${relativeFromWorktree(paths, paths.uiDesignImagePath)} and the design brief at ${relativeFromWorktree(paths, paths.uiDesignBriefPath)} before changing UI code.`,
          "- Treat the generated design image as strong design direction for layout, hierarchy, density, and interaction states, while still adapting it to the existing codebase and accessibility constraints.",
          "- If issue-provided reference images conflict with the generated design image, prioritize the issue-provided reference images.",
          "- Prefer tight, polished UI work over broad refactors when solving the issue."
        ]
      : agentTool === "spawn_claude_planner_agent"
        ? [
            `- This issue is running via ${tool.label} because the preferred provider was unavailable.`,
            `- Use ${relativeFromWorktree(paths, path.join(config.engineRoot, "prompts", "planner-agent.md"))} as the planning-specific rule set for this run.`,
            "- Your primary job is still to decide whether the request should be decomposed into multiple smaller issues instead of being implemented directly.",
            "- If the request is worth pursuing but too large, return `decomposed` with a structured decomposition plan instead of `rejected`.",
            "- Use `dependsOn` only for true blocking relationships between child tasks. Leave it empty for tasks that can proceed in parallel.",
            "- Do not open a PR for the oversized parent issue itself."
          ]
        : agentTool === "spawn_claude_issue_agent"
          ? [
              `- This issue is running via ${tool.label} because the preferred provider was unavailable.`,
              "- Handle it as the general-purpose implementation path, not as a UI-specialized run."
            ]
      : agentTool === "spawn_codex_planner_agent"
        ? [
            `- This issue was dispatched via ${tool.label}. Your primary job is to decide whether the request should be decomposed into multiple smaller issues instead of being implemented directly.`,
            `- Use ${relativeFromWorktree(paths, path.join(config.engineRoot, "prompts", "planner-agent.md"))} as the planning-specific rule set for this run.`,
            "- If the request is worth pursuing but too large, return `decomposed` with a structured decomposition plan instead of `rejected`.",
            "- When decomposing, use `dependsOn` only for true blocking relationships between child tasks. Leave it empty for tasks that can proceed in parallel.",
            "- Do not open a PR for the oversized parent issue itself."
          ]
      : [
          `- This issue was dispatched via ${tool.label}. Handle it as the general-purpose implementation path.`
        ];

  return [
    `You are OpenReactor's autonomous issue agent for GitHub issue #${issue.number}.`,
    "",
    "Read these files before doing anything else:",
    ...(repoDocs.uiSystem ? [`- ${relativeFromWorktree(paths, repoDocs.uiSystem)}`] : []),
    `- ${relativeFromWorktree(paths, path.join(config.engineRoot, "prompts", "product-context.md"))}`,
    `- ${relativeFromWorktree(paths, path.join(config.engineRoot, "prompts", "issue-agent.md"))}`,
    `- ${relativeFromWorktree(paths, path.join(config.engineRoot, "prompts", "quality-gates.md"))}`,
    `- ${relativeFromWorktree(paths, repoDocs.productSpec)}`,
    `- ${relativeFromWorktree(paths, repoDocs.productConstitution)}`,
    ...(repoDocs.triagePolicy ? [`- ${relativeFromWorktree(paths, repoDocs.triagePolicy)}`] : []),
    `- ${relativeFromWorktree(paths, repoDocs.roadmap)}`,
    `- ${relativeFromWorktree(paths, repoDocs.memory)}`,
    `- ${relativeFromWorktree(paths, repoDocs.readme)}`,
    `- ${relativeFromWorktree(paths, path.join(config.engineRoot, "OPENREACTOR_WORKFLOW.md"))}`,
    `- ${relativeFromWorktree(paths, path.join(config.engineRoot, "STACK_WORKFLOWS.md"))}`,
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
    `- Request authority: ${requestAuthority}`,
    `- Steering actor: ${steeringUsername ? `@${steeringUsername}` : "none"}`,
    `- Trusted submitter attribution: ${
      trustedSubmitter ? `yes (@${trustedSubmitter.username} via ${trustedSubmitter.source})` : "no"
    }`,
    "",
    "Rules for this run:",
    "- Stay on the current branch. Do not create a different branch name.",
    ...(requestAuthority === "steering"
      ? [
          "- Treat the issue as trusted repo steering, not as ordinary public feedback.",
          "- Preserve the requested scope unless a hard safety, legality, secrecy, or concrete feasibility blocker requires decomposition or explicit human handoff."
        ]
      : [
          "- Treat the issue as product feedback, not a binding specification.",
          "- You may reject the request if that is better for the product.",
          "- If accepted, you may reinterpret the request and implement the best product change."
        ]),
    "- If a request carries a valid product signal through an overly rigid numeric target, hard cap, or absolute rule, do not reject it on that basis alone.",
    ...(requestAuthority === "feedback"
      ? [
          "- For directionally sound requests, prefer the smallest useful accepted change that addresses the concern and explain the softened interpretation clearly."
        ]
      : []),
    "- If you touch rendered UI, browser verification is mandatory before returning accepted.",
    ...toolRules,
    "- A starter plan.json already exists. Update it instead of replacing it with a different shape.",
    "- Append progress to progress.md before finishing.",
    "- If you discover durable learnings, update the relevant shared docs in prompts/, MEMORY.md, CONSTITUTION.md, PRODUCT_CONSTITUTION.md, OPENREACTOR_WORKFLOW.md, or nearby docs.",
    "- Never commit secrets, API keys, private tokens, or credentials.",
    "- Use gh for GitHub issue and PR operations. GH_TOKEN is already available.",
    `- Use \`bun ${JSON.stringify(path.join(config.engineRoot, "reactor", "tool.ts"))} ensure-plan ...\` if the plan scaffold needs to be restored.`,
    `- Use \`bun ${JSON.stringify(path.join(config.engineRoot, "reactor", "tool.ts"))} ensure-pr ...\` when finishing an accepted run so PR creation is idempotent.`,
    `- Keep the claim label ${config.runningLabel} in place if more iterations are needed.`,
    `- If you finish with accepted or rejected, remove ${config.runningLabel} yourself and apply the final label.`,
    "- If you return accepted, the reactor will verify that a remote branch exists, a PR exists for the branch, at least one reported check passed, no reported checks failed, and any real GitHub CI checks on the PR head are not failing or still pending.",
    `- If you are repairing an open conflicted PR, fetch origin, merge or rebase from origin/${config.defaultBranch}, resolve conflicts in the current branch, rerun checks, and update the same PR instead of opening a replacement.`,
    "- Never recreate or reopen a PR that is already merged. Auto-healing only applies to the still-open PR on the issue branch.",
    "- If human action is required, prepare a clean handoff with exact instructions and do not pretend the task is fully complete.",
    "- If a maintainer-only step still blocks the feature, do not return accepted. Leave an open PR, disable auto-merge with `--no-auto-merge`, set humanHandoff.required=true, and return retry.",
    "- Fill `considerations` with 2-6 short public-facing bullets covering the main tradeoffs, constraints, or observations that shaped your decision. Do not include hidden chain-of-thought.",
    ...(requestAuthority === "steering"
      ? [
          `- This issue is trusted repo steering${steeringUsername ? ` from @${steeringUsername}` : ""}.`,
          "- Do not reject, narrow, or silently soften explicit scope requirements solely for roadmap fit, current product direction, constitution-fit, or implementation convenience.",
          "- If the full request is too large for one safe pass, decompose it into child issues that preserve the original required scope instead of dropping parts of it.",
          "- Still enforce hard safety rules, legality, secret handling, and realistic human-handoff constraints."
        ]
      : []),
    ...(trustedSubmitter
      ? [
          `- Trusted submitter attribution is available for @${trustedSubmitter.username}. If you create accepted work, you may credit that account as a co-author.`
        ]
      : [
          "- Do not treat a free-text GitHub username in the issue body as trusted attribution unless the issue context says the submitter identity is trusted."
        ]),
    "",
    "Return only JSON matching the provided output schema.",
    "",
    RESULT_MARKER
  ].join("\n");
}

async function buildTriagePrompt(
  config: OrchestratorConfig,
  issue: GitHubIssue,
  paths: IssueRuntimePaths,
  comments: GitHubIssueComment[],
  requestAuthority: RequestAuthority,
  steeringUsername: string | null
): Promise<string> {
  const trustedSubmitter = getTrustedSubmitterSignal(config, issue);
  const repoDocs = await resolveRepoDocumentationPaths(config.repoRoot);
  const labels = issue.labels.map((label) => label.name).filter(Boolean).join(", ") || "_None_";
  return [
    `You are OpenReactor's lightweight issue triage agent for GitHub issue #${issue.number}.`,
    "",
    "Read these files before deciding:",
    `- ${relativeFromRepo(config, path.join(config.engineRoot, "prompts", "triage-agent.md"))}`,
    `- ${relativeFromRepo(config, path.join(config.engineRoot, "prompts", "product-context.md"))}`,
    `- ${relativeFromRepo(config, path.join(config.engineRoot, "prompts", "issue-agent.md"))}`,
    `- ${relativeFromRepo(config, path.join(config.engineRoot, "CONSTITUTION.md"))}`,
    `- ${relativeFromRepo(config, repoDocs.productSpec)}`,
    `- ${relativeFromRepo(config, repoDocs.productConstitution)}`,
    ...(repoDocs.triagePolicy ? [`- ${relativeFromRepo(config, repoDocs.triagePolicy)}`] : []),
    `- ${relativeFromRepo(config, path.join(config.engineRoot, "OPENREACTOR_WORKFLOW.md"))}`,
    `- ${relativeFromRepo(config, path.join(config.engineRoot, "STACK_WORKFLOWS.md"))}`,
    `- ${relativeFromRepo(config, repoDocs.roadmap)}`,
    `- ${relativeFromRepo(config, repoDocs.memory)}`,
    `- ${relativeFromRepo(config, repoDocs.readme)}`,
    "",
    "Issue context:",
    `- Issue: #${issue.number}`,
    `- Title: ${issue.title}`,
    `- URL: ${issue.html_url}`,
    `- Request authority: ${requestAuthority}`,
    `- Steering actor: ${steeringUsername ? `@${steeringUsername}` : "none"}`,
    `- Trusted submitter attribution: ${
      trustedSubmitter ? `yes (@${trustedSubmitter.username} via ${trustedSubmitter.source})` : "no"
    }`,
    `- Labels: ${labels}`,
    "",
    "Issue body:",
    issue.body?.trim() || "_No body provided._",
    "",
    "Recent issue discussion:",
    formatRecentDiscussion(comments),
    "",
    "Your job:",
    "- Classify the target surface as `main`, `playground`, or `openreactor-core`.",
    "- Classify the likely surface sensitivity of the request as `low`, `medium`, or `high`.",
    "- Classify the current evidence strength for making the change now as `weak`, `moderate`, or `strong`.",
    "- Use `main` for the repo's normal user-facing or product-facing surfaces.",
    "- Use `playground` only if the repo-local policy defines an intentionally experimental or permissive surface for this product.",
    "- Use `openreactor-core` only for OpenReactor engine/workflow changes: reactor orchestration, watchdog behavior, prompts, governance, agent routing, merge policy, or other maintainer-controlled OpenReactor mechanisms.",
    "- Do not use `openreactor-core` for the managed product's own backend, APIs, infrastructure, or deployment setup unless the task is actually changing the OpenReactor engine rather than the product it is building.",
    "- Reject only if the issue is clearly out of bounds, clearly lacks a real task, or is clearly unsafe.",
    "- Bank for later when the direction seems potentially good but should not be acted on yet because evidence is weak for the sensitivity level, timing is wrong, or the request should accumulate more supporting feedback first.",
    "- Dispatch anything plausible, ambiguous, weird-but-harmless, or potentially valuable when the evidence is strong enough for the likely sensitivity.",
    "- Treat admin or privileged internal changes as high sensitivity. Unless maintainer steering is explicit, do not dispatch those from random public feedback.",
    "- Fill `considerations` with 2-5 short public-facing bullets describing the main factors that shaped your judgment. Do not include hidden chain-of-thought.",
    ...(requestAuthority === "steering"
      ? [
          `- This issue is trusted repo steering${steeringUsername ? ` from @${steeringUsername}` : ""}.`,
          "- Do not reject, bank, or scope-soften it solely for roadmap fit, product-direction fit, constitution-fit, or implementation convenience. If it is too large, dispatch the planner so the full requested scope is preserved through decomposition."
        ]
      : [
          "- This issue is market feedback. Use product judgment, sensitivity, and evidence to decide whether to reject it, bank it, or dispatch it."
        ]),
    "- Do not perform implementation work, open PRs, or mutate files.",
    "",
    "Available implementation tools:",
    describeAgentToolsForPrompt(),
    "",
    "Return only JSON matching the provided output schema."
  ].join("\n");
}

function getLegacySteeringUsername(
  config: Pick<OrchestratorConfig, "owner" | "maintainerSteeredLabel">,
  issue: Pick<GitHubIssue, "body" | "labels" | "user" | "author_association">
): string | null {
  const authorLogin = normalizeGitHubUsername(issue.user?.login ?? null);
  if (authorLogin && authorLogin.toLowerCase() === config.owner.toLowerCase()) {
    return authorLogin;
  }

  if (issueHasLabel(issue, config.maintainerSteeredLabel)) {
    const username = normalizeGitHubUsername(readStructuredIssueField(issue.body, "GitHub Username"));
    if (username) {
      return username;
    }

    return config.owner;
  }

  return null;
}

function getLegacyRequestAuthority(
  config: Pick<OrchestratorConfig, "owner" | "maintainerSteeredLabel">,
  issue: Pick<GitHubIssue, "body" | "labels" | "user" | "author_association">
): RequestAuthority {
  return getLegacySteeringUsername(config, issue) ? "steering" : "feedback";
}

function getTrustedSubmitterSignal(
  config: Pick<OrchestratorConfig, "authenticatedSubmitterLabel">,
  issue: Pick<GitHubIssue, "body" | "labels" | "user" | "author_association">
): TrustedSubmitterSignal | null {
  const authorLogin = normalizeGitHubUsername(issue.user?.login ?? null);
  if (authorLogin && !/\[bot\]$/i.test(authorLogin)) {
    return { username: authorLogin, source: "issue-author" };
  }

  if (!issueHasLabel(issue, config.authenticatedSubmitterLabel)) {
    return null;
  }

  const username = normalizeGitHubUsername(readStructuredIssueField(issue.body, "GitHub Username"));
  if (!username) {
    return null;
  }

  return { username, source: "trusted-label" };
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

function issueHasLabel(
  issue: Pick<GitHubIssue, "labels">,
  labelName: string
): boolean {
  return issue.labels.some(
    (label) => (label.name ?? "").toLowerCase() === labelName.toLowerCase()
  );
}

function formatRecentDiscussion(comments: GitHubIssueComment[]): string {
  const discussionComments = comments
    .filter((comment) => !comment.body.includes(RESULT_MARKER) && !comment.body.includes("<!-- openreactor:status -->"))
    .slice(-8);

  if (!discussionComments.length) {
    return "_No discussion yet beyond the issue body._";
  }

  return discussionComments
    .map((comment) => {
      const author = comment.user?.login ? `@${comment.user.login}` : "Unknown";
      return [`### ${author} — ${comment.updated_at}`, "", comment.body.trim() || "_No body provided._"].join("\n");
    })
    .join("\n\n");
}

function providerLabelFor(provider: "codex" | "claude"): string {
  return provider === "claude" ? "Anthropic" : "OpenAI";
}

function buildAgentEnv(
  config: OrchestratorConfig,
  issue: GitHubIssue,
  paths: IssueRuntimePaths,
  githubToken: string,
  extraEnv: Record<string, string> = {}
): NodeJS.ProcessEnv {
  const inheritedPath = config.workspacePolicy.env?.PATH ?? process.env.PATH ?? "";

  return {
    ...process.env,
    ...(config.workspacePolicy.env ?? {}),
    GH_TOKEN: githubToken,
    GITHUB_TOKEN: githubToken,
    OPENREACTOR_REPO_OWNER: config.owner,
    OPENREACTOR_REPO_NAME: config.repo,
    OPENREACTOR_ENGINE_ROOT: config.engineRoot,
    OPENREACTOR_ENGINE_TOOL: path.join(config.engineRoot, "reactor", "tool.ts"),
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
    ...extraEnv,
    PATH: `${path.join(paths.worktreePath, "node_modules", ".bin")}${path.delimiter}${inheritedPath}`
  };
}

function buildExecutionMetadata(
  template: ActiveRun["executionTemplate"],
  startedAtMs: number,
  completedAtMs: number
): ExecutionMetadata {
  return {
    stage: "implementation",
    providerKey: template.providerKey,
    providerLabel: template.providerLabel,
    model: template.model,
    reasoningEffort: template.reasoningEffort,
    serviceTier: template.serviceTier,
    toolName: template.toolName,
    toolLabel: template.toolLabel,
    primaryUse: template.primaryUse,
    startedAt: new Date(startedAtMs).toISOString(),
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: Math.max(0, completedAtMs - startedAtMs)
  };
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

export function issueHasReferenceImages(
  issue: Pick<GitHubIssue, "body">,
  discussionComments: GitHubIssueComment[] = []
): boolean {
  return collectReferenceImageCandidates(issue, discussionComments).length > 0;
}

export async function prepareRunReferenceImages(
  issue: Pick<GitHubIssue, "body">,
  paths: Pick<IssueRuntimePaths, "referenceImagesDir">,
  discussionComments: GitHubIssueComment[] = []
): Promise<RunReferenceImage[]> {
  const candidates = collectReferenceImageCandidates(issue, discussionComments);
  if (!candidates.length) {
    return [];
  }

  await fs.rm(paths.referenceImagesDir, { recursive: true, force: true });
  await fs.mkdir(paths.referenceImagesDir, { recursive: true });

  const images: RunReferenceImage[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const downloaded = await downloadReferenceImage(candidate, paths.referenceImagesDir, index + 1);
    if (downloaded) {
      images.push(downloaded);
    }
  }

  return images;
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
  imagePaths?: string[];
}): string[] {
  const args = buildCodexExecArgs(input);
  args.push(
    "--output-schema",
    input.outputSchemaPath,
    "-o",
    input.outputPath
  );

  return args;
}

function buildCodexExecArgs(input: {
  model: string;
  reasoningEffort: string;
  serviceTier: string;
  fullAccess: boolean;
  imagePaths?: string[];
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

  for (const imagePath of input.imagePaths ?? []) {
    args.push("-i", imagePath);
  }

  if (input.fullAccess) {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  } else {
    args.push("-a", "never", "-s", "read-only");
  }

  args.push(
    "exec",
    "-",
    "--skip-git-repo-check"
  );

  return args;
}

interface ReferenceImageCandidate {
  url: string;
  source: "issue-body" | "discussion";
  sourceLabel: string;
}

function collectReferenceImageCandidates(
  issue: Pick<GitHubIssue, "body">,
  discussionComments: GitHubIssueComment[]
): ReferenceImageCandidate[] {
  const seen = new Set<string>();
  const candidates: ReferenceImageCandidate[] = [];

  const pushUnique = (candidate: ReferenceImageCandidate): void => {
    const normalizedUrl = normalizeReferenceImageUrl(candidate.url);
    if (!normalizedUrl || seen.has(normalizedUrl)) {
      return;
    }

    seen.add(normalizedUrl);
    candidates.push({
      ...candidate,
      url: normalizedUrl
    });
  };

  for (const url of extractImageUrls(issue.body ?? "")) {
    pushUnique({
      url,
      source: "issue-body",
      sourceLabel: "Issue body"
    });
  }

  for (const comment of discussionComments) {
    const author = comment.user?.login ? `@${comment.user.login}` : "a discussion comment";
    for (const url of extractImageUrls(comment.body)) {
      pushUnique({
        url,
        source: "discussion",
        sourceLabel: `Discussion from ${author} on ${comment.updated_at}`
      });
    }
  }

  return candidates;
}

function extractImageUrls(markdown: string): string[] {
  const urls: string[] = [];
  const markdownPattern = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi;
  const htmlPattern = /<img\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
  const directImagePattern = /\bhttps?:\/\/[^\s<>()]+?\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s<>()]+)?\b/gi;

  for (const pattern of [markdownPattern, htmlPattern, directImagePattern]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(markdown)) !== null) {
      const url = match[1] ?? match[0];
      if (url) {
        urls.push(url);
      }
    }
  }

  return urls;
}

function normalizeReferenceImageUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

async function downloadReferenceImage(
  candidate: ReferenceImageCandidate,
  targetDir: string,
  index: number
): Promise<RunReferenceImage | null> {
  let response: Response;
  try {
    response = await fetch(candidate.url);
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return null;
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const extension = pickReferenceImageExtension(candidate.url, contentType);
  const fileName = `${String(index).padStart(2, "0")}-${sanitizeReferenceImageBaseName(candidate.url)}${extension}`;
  const localPath = path.join(targetDir, fileName);
  await fs.writeFile(localPath, bytes);

  return {
    sourceUrl: candidate.url,
    localPath,
    source: candidate.source,
    sourceLabel: candidate.sourceLabel
  };
}

function pickReferenceImageExtension(url: string, contentType: string): string {
  const fromUrl = path.extname(new URL(url).pathname).toLowerCase();
  if (fromUrl) {
    return fromUrl;
  }

  const mimeType = contentType.toLowerCase().split(";")[0].trim();
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    case "image/svg+xml":
      return ".svg";
    default:
      return ".img";
  }
}

function sanitizeReferenceImageBaseName(url: string): string {
  const pathname = new URL(url).pathname;
  const baseName = path.basename(pathname, path.extname(pathname)).trim().toLowerCase();
  const sanitized = baseName.replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || "reference-image";
}

function formatReferenceImageContext(
  config: OrchestratorConfig,
  paths: IssueRuntimePaths,
  referenceImages: RunReferenceImage[]
): string {
  if (!referenceImages.length) {
    return "_No reference images were detected on the issue body or recent discussion._";
  }

  return referenceImages
    .map((image, index) =>
      [
        `${index + 1}. ${image.sourceLabel}`,
        `   - Local file: ${relativeFromRepo(config, image.localPath)}`,
        `   - Source URL: ${image.sourceUrl}`
      ].join("\n")
    )
    .join("\n");
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
