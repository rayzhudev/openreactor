import process from "node:process";
import { loadConfig, type OrchestratorConfig } from "./config";
import {
  DEFAULT_AGENT_TOOL,
  getAgentTool,
  isAgentToolName,
  type AgentToolName
} from "./agent-tools";
import {
  GitHubClient,
  type GitHubIssue,
  type GitHubIssueComment,
  type GitHubPullRequest
} from "./github";
import {
  type AgentResult,
  createInitialRunRecord,
  ensureRemoteBranchExists,
  ensureIssueWorktree,
  ensureRuntimeDirectories,
  finalizeIssueAgentRun,
  issueRuntimePaths,
  readRunRecord,
  runIssueTriage,
  spawnIssueAgent,
  writeIssueContext,
  writeRunRecord,
  type ActiveRun,
  type RunRecord
} from "./runner";

const STATUS_COMMENT_MARKER = "<!-- openreactor:status -->";

class Reactor {
  private readonly config: OrchestratorConfig;
  private readonly github: GitHubClient;
  private readonly activeRuns = new Map<number, ActiveRun>();
  private readonly pendingRetries = new Set<number>();
  private stopped = false;

  constructor(private readonly dryRun: boolean) {
    this.config = loadConfig();
    this.github = new GitHubClient(this.config);
  }

  async start(once: boolean): Promise<void> {
    await ensureRuntimeDirectories(this.config);
    await this.ensureLabels();

    await this.tick();
    if (once) {
      return;
    }

    while (!this.stopped) {
      await sleep(this.config.pollIntervalMs);
      await this.tick();
    }
  }

  stop(): void {
    this.stopped = true;
    for (const activeRun of this.activeRuns.values()) {
      activeRun.process.kill("SIGTERM");
      clearInterval(activeRun.heartbeatTimer);
    }
  }

  private async ensureLabels(): Promise<void> {
    if (this.dryRun) {
      return;
    }

    await this.github.ensureLabel(
      this.config.runningLabel,
      "1f6feb",
      "OpenReactor currently has an autonomous agent running on this issue."
    );
    await this.github.ensureLabel(
      this.config.pausedLabel,
      "bf8700",
      "OpenReactor paused automatic handling for this issue after repeated infrastructure failures."
    );
    await this.github.ensureLabel(
      this.config.acceptedLabel,
      "238636",
      "OpenReactor accepted this issue and should ship or is shipping a change."
    );
    await this.github.ensureLabel(
      this.config.rejectedLabel,
      "cf222e",
      "OpenReactor rejected this issue as not worth implementing."
    );
  }

  private async tick(): Promise<void> {
    await this.reconcileStaleActiveRuns();

    const issues = await this.github.listOpenIssues();
    const candidates = issues.filter((issue) => this.isRelevantIssue(issue));

    if (this.dryRun) {
      const eligible = candidates.filter((issue) => this.isEligibleForClaim(issue));
      console.log(
        JSON.stringify(
          {
            mode: "dry-run",
            issueCount: issues.length,
            candidateCount: candidates.length,
            eligibleIssues: eligible.map((issue) => ({
              number: issue.number,
              title: issue.title
            }))
          },
          null,
          2
        )
      );
      return;
    }

    await this.reconcileTerminalIssueState(candidates);
    await this.reconcileOpenPullRequests();
    await this.resumeClaimedIssues(candidates);

    for (const issue of candidates) {
      if (this.activeRuns.size >= this.config.maxConcurrentIssues) {
        break;
      }

      if (!this.isEligibleForClaim(issue)) {
        continue;
      }

      await this.github.addLabels(issue.number, [this.config.runningLabel]);
      await this.syncIssueStatusComment(issue.number, {
        status: "in-progress",
        phase: "triage",
        detail:
          "Claimed by the reactor. Starting lightweight triage before dispatching the request to the best implementation agent."
      });
      let triageDecision: AgentToolName | null = null;
      try {
        triageDecision = await this.triageIssue(issue);
      } catch (error) {
        await this.handleStartFailure(issue, {
          phase: "triage",
          error
        });
        continue;
      }
      if (!triageDecision) {
        continue;
      }

      await this.startIssue(issue, undefined, triageDecision);
    }
  }

  private async triageIssue(issue: GitHubIssue): Promise<AgentToolName | null> {
    const paths = issueRuntimePaths(this.config, issue.number);
    const accessToken = await this.github.getAgentAccessToken();
    const { result } = await runIssueTriage({
      config: this.config,
      issue,
      paths,
      githubToken: accessToken
    });

    if (result?.outcome === "reject") {
      await this.syncIssueStatusComment(issue.number, {
        status: "rejected",
        phase: "triage",
        detail: "Rejected during lightweight triage as not worth pursuing in the current product direction."
      });
      await this.github.createComment(issue.number, result.issueComment || result.summary);
      await this.github.addLabels(issue.number, [this.config.rejectedLabel]);
      await this.github.removeLabel(issue.number, this.config.runningLabel);
      await this.github.closeIssue(issue.number, "not_planned");
      return null;
    }

    if (result?.outcome === "dispatch") {
      const toolName = isAgentToolName(result.toolName) ? result.toolName : DEFAULT_AGENT_TOOL;
      const tool = getAgentTool(toolName);
      await this.syncIssueStatusComment(issue.number, {
        status: "in-progress",
        phase: toolName === "spawn_codex_planner_agent" ? "planning" : "implementation",
        detail:
          result.toolReason ??
          `Lightweight triage selected ${tool.label} for the next implementation attempt.`
      });
      return toolName;
    }

    return DEFAULT_AGENT_TOOL;
  }

  private async reconcileStaleActiveRuns(): Promise<void> {
    const now = Date.now();

    for (const activeRun of this.activeRuns.values()) {
      if (now - activeRun.startedAt < this.config.maxIterationRuntimeMs) {
        continue;
      }

      const reason =
        `OpenReactor stopped this iteration after ${Math.round(this.config.maxIterationRuntimeMs / 60_000)} minutes without completion so it can retry cleanly.`;
      const shouldComment = activeRun.record.lastError !== reason;

      activeRun.record.status = "retry";
      activeRun.record.lastError = reason;
      activeRun.record.updatedAt = new Date().toISOString();
      activeRun.record.lastHeartbeatAt = activeRun.record.updatedAt;
      await writeRunRecord(issueRuntimePaths(this.config, activeRun.issue.number), activeRun.record);

      if (shouldComment) {
        try {
          await this.syncIssueStatusComment(activeRun.issue.number, {
            status: "in-progress",
            phase: "retrying",
            iteration: activeRun.record.iteration,
            detail: `Iteration ${activeRun.record.iteration} hit the runtime limit, so the reactor is stopping it and preparing a clean retry.`
          });
          await this.github.createComment(activeRun.issue.number, reason);
        } catch {
          // Retry orchestration should continue even if the status comment fails.
        }
      }

      activeRun.process.kill("SIGTERM");
    }
  }

  private async reconcileTerminalIssueState(issues: GitHubIssue[]): Promise<void> {
    for (const issue of issues) {
      if (this.activeRuns.has(issue.number)) {
        continue;
      }

      const labels = getLabelNames(issue);
      if (labels.has(this.config.runningLabel)) {
        continue;
      }

      if (labels.has(this.config.rejectedLabel)) {
        await this.github.closeIssue(issue.number, "not_planned");
        continue;
      }

      if (!labels.has(this.config.acceptedLabel)) {
        continue;
      }

      const branchName = issueRuntimePaths(this.config, issue.number).branchName;
      const pullRequest = await this.github.findPullRequestByBranch(branchName, "all");
      if (!pullRequest) {
        continue;
      }

      const merged = await this.github.isPullRequestMerged(pullRequest.number);
      if (!merged) {
        continue;
      }

      await this.github.createComment(
        issue.number,
        `OpenReactor marked this issue complete because ${pullRequest.html_url} was merged.`
      );
      await this.github.closeIssue(issue.number, "completed");
    }
  }

  private async reconcileOpenPullRequests(): Promise<void> {
    if (this.activeRuns.size >= this.config.maxConcurrentIssues) {
      return;
    }

    const pullRequests = await this.github.listOpenPullRequests();
    for (const pullRequest of pullRequests) {
      if (this.activeRuns.size >= this.config.maxConcurrentIssues) {
        return;
      }

      const branchName = (pullRequest.head?.ref ?? "").trim();
      const issueNumber = parseIssueNumberFromBranch(this.config.branchPrefix, branchName);
      if (issueNumber === null) {
        continue;
      }

      if (this.activeRuns.has(issueNumber) || this.pendingRetries.has(issueNumber)) {
        continue;
      }

      const fullPullRequest = await this.github.getPullRequest(pullRequest.number);
      if (!hasMergeConflict(fullPullRequest)) {
        continue;
      }

      const issue = await this.github.getIssue(issueNumber);
      await this.queueConflictRepair(issue, fullPullRequest);
    }
  }

  private async queueConflictRepair(
    issue: GitHubIssue,
    pullRequest: GitHubPullRequest
  ): Promise<void> {
    if (pullRequest.state !== "open") {
      return;
    }

    const reason =
      `Open PR ${pullRequest.html_url} has merge conflicts and needs an autonomous refresh.`;
    const paths = issueRuntimePaths(this.config, issue.number);
    const existingRecord = await readRunRecord(paths);
    const record = existingRecord ?? (await createInitialRunRecord(issue, paths));
    const shouldComment = record.lastError !== reason;

    record.status = "retry";
    record.lastError = reason;
    record.updatedAt = new Date().toISOString();
    record.lastHeartbeatAt = record.updatedAt;
    await writeRunRecord(paths, record);

    if (shouldComment) {
      await this.github.createComment(
        pullRequest.number,
        [
          "OpenReactor detected that this PR is blocked by merge conflicts with `main`.",
          "",
          `The reactor is reclaiming issue #${issue.number} on branch \`${paths.branchName}\` to refresh this PR instead of leaving it hanging.`
        ].join("\n")
      );
    }

    await this.github.addLabels(issue.number, [this.config.runningLabel]);
    await this.startIssue(issue, record);
  }

  private async resumeClaimedIssues(issues: GitHubIssue[]): Promise<void> {
    for (const issue of issues) {
      if (this.activeRuns.size >= this.config.maxConcurrentIssues) {
        return;
      }

      const labels = getLabelNames(issue);
      if (!labels.has(this.config.runningLabel)) {
        continue;
      }

      if (this.activeRuns.has(issue.number)) {
        continue;
      }

      const paths = issueRuntimePaths(this.config, issue.number);
      const record = await readRunRecord(paths);
      if (!record) {
        continue;
      }

      if (record.status === "accepted" || record.status === "rejected" || record.status === "decomposed") {
        continue;
      }

      if (!record.agentTool) {
        try {
          const triageDecision = await this.triageIssue(issue);
          if (!triageDecision) {
            continue;
          }

          await this.startIssue(issue, record, triageDecision);
        } catch (error) {
          await this.handleStartFailure(issue, {
            phase: "triage",
            error,
            record
          });
        }
        continue;
      }

      await this.startIssue(issue, record);
    }
  }

  private isRelevantIssue(issue: GitHubIssue): boolean {
    if (issue.pull_request) {
      return false;
    }

    if (issue.body?.includes(this.config.featureRequestMarker)) {
      return true;
    }

    return true;
  }

  private isEligibleForClaim(issue: GitHubIssue): boolean {
    if (this.activeRuns.has(issue.number)) {
      return false;
    }

    const labels = getLabelNames(issue);
    if (labels.has(this.config.runningLabel)) {
      return false;
    }

    if (labels.has(this.config.pausedLabel)) {
      return false;
    }

    if (labels.has(this.config.acceptedLabel) || labels.has(this.config.rejectedLabel)) {
      return false;
    }

    return true;
  }

  private async startIssue(
    issue: GitHubIssue,
    existingRecord?: RunRecord,
    selectedTool?: AgentToolName
  ): Promise<void> {
    const paths = issueRuntimePaths(this.config, issue.number);
    const agentTool = selectedTool ?? existingRecord?.agentTool ?? DEFAULT_AGENT_TOOL;
    const record = existingRecord ?? (await createInitialRunRecord(issue, paths));
    record.agentTool = agentTool;

    try {
      await ensureIssueWorktree(this.config, paths);
      await writeIssueContext(this.config, issue, paths);
      await writeRunRecord(paths, record);
      await this.syncIssueStatusComment(issue.number, {
        status: "in-progress",
        phase: existingRecord ? "retrying" : "reviewing",
        iteration: record.iteration + 1,
        detail: existingRecord
          ? `Retry iteration ${record.iteration + 1} is running after the previous attempt ended without a final decision.`
          : "Full issue agent is reviewing the request and deciding the best product change."
      });

      const accessToken = await this.github.getAgentAccessToken();
      const activeRun = await spawnIssueAgent({
        config: this.config,
        issue,
        paths,
        record,
        githubToken: accessToken
      });

      this.activeRuns.set(issue.number, activeRun);
      void this.handleRunCompletion(activeRun);
    } catch (error) {
      await this.handleStartFailure(issue, {
        phase: existingRecord ? "retry-startup" : "startup",
        error,
        record,
        selectedTool: agentTool
      });
    }
  }

  private async handleStartFailure(
    issue: GitHubIssue,
    input: {
      phase: "triage" | "startup" | "retry-startup";
      error: unknown;
      record?: RunRecord;
      selectedTool?: AgentToolName;
    }
  ): Promise<void> {
    const paths = issueRuntimePaths(this.config, issue.number);
    const record =
      input.record ??
      (await readRunRecord(paths)) ??
      (await createInitialRunRecord(issue, paths));
    const nextStartFailureCount = (record.startFailureCount ?? 0) + 1;
    const failureMessage = `${input.phase}: ${formatError(input.error)}`;

    record.agentTool = input.selectedTool ?? record.agentTool;
    record.startFailureCount = nextStartFailureCount;
    record.status =
      nextStartFailureCount >= this.config.maxStartFailuresPerIssue ? "failed" : "retry";
    record.lastError = failureMessage;
    record.updatedAt = new Date().toISOString();
    record.lastHeartbeatAt = record.updatedAt;
    await writeRunRecord(paths, record);

    if (nextStartFailureCount >= this.config.maxStartFailuresPerIssue) {
      await this.github.removeLabel(issue.number, this.config.runningLabel);
      await this.github.addLabels(issue.number, [this.config.pausedLabel]);
      await this.syncIssueStatusComment(issue.number, {
        status: "queued",
        phase: "paused",
        detail:
          `Automatic handling paused after ${nextStartFailureCount} ${input.phase} failures. ` +
          `Remove ${this.config.pausedLabel} to retry after fixing the infrastructure problem.`
      });
      await this.github.createComment(
        issue.number,
        [
          "OpenReactor paused automatic retries for this issue after repeated startup failures.",
          "",
          `Phase: ${input.phase}`,
          `Failures: ${nextStartFailureCount}/${this.config.maxStartFailuresPerIssue}`,
          `Last error: ${failureMessage}`,
          "",
          `To retry after fixing the underlying problem, remove the \`${this.config.pausedLabel}\` label and, if present, re-add \`${this.config.runningLabel}\` or leave the issue open for the reactor to reclaim.`
        ].join("\n")
      );
      return;
    }

    await this.syncIssueStatusComment(issue.number, {
      status: "queued",
      phase: "retrying",
      detail:
        `The reactor hit a ${input.phase} error and will retry automatically ` +
        `(${nextStartFailureCount}/${this.config.maxStartFailuresPerIssue}). ${failureMessage}`
    });
  }

  private async handleRunCompletion(activeRun: ActiveRun): Promise<void> {
    const issueNumber = activeRun.issue.number;
    const paths = issueRuntimePaths(this.config, issueNumber);

    try {
      const { result, exitCode } = await finalizeIssueAgentRun({
        activeRun,
        paths
      });

      if (result?.outcome === "accepted") {
        const acceptedValidation = await this.validateAcceptedResult(paths.branchName, result);
        if (!acceptedValidation.ok) {
          activeRun.record.status = "retry";
          activeRun.record.lastError = acceptedValidation.reason;
          await writeRunRecord(paths, activeRun.record);
        } else {
          activeRun.record.lastError = "";
          activeRun.record.lastResult = {
            ...result,
            prUrl: acceptedValidation.pullRequest.html_url
          };
          await writeRunRecord(paths, activeRun.record);
          await this.syncIssueStatusComment(issueNumber, {
            status: "complete",
            phase: "accepted",
            iteration: activeRun.record.iteration,
            detail: `Accepted and linked to PR ${acceptedValidation.pullRequest.html_url}.`
          });
          await this.github.addLabels(issueNumber, [this.config.acceptedLabel]);
          await this.github.removeLabel(issueNumber, this.config.runningLabel);
          return;
        }
      }

      if (result?.outcome === "rejected") {
        await this.syncIssueStatusComment(issueNumber, {
          status: "rejected",
          phase: "rejected",
          iteration: activeRun.record.iteration,
          detail: result.summary
        });
        await this.github.addLabels(issueNumber, [this.config.rejectedLabel]);
        await this.github.removeLabel(issueNumber, this.config.runningLabel);
        await this.github.closeIssue(issueNumber, "not_planned");
        return;
      }

      if (result?.outcome === "decomposed") {
        if (!result.decomposition?.childIssues?.length) {
          activeRun.record.status = "retry";
          activeRun.record.lastError = "decomposed result must include at least one child issue";
          await writeRunRecord(paths, activeRun.record);
        } else {
          const createdIssues = [];
          for (const child of result.decomposition.childIssues) {
            const title = normalizeDecomposedIssueTitle(child.title);
            const body = ensureParentLinkInDecomposedIssueBody(activeRun.issue, child.body);
            const createdIssue = await this.github.createIssue({
              title,
              body
            });
            createdIssues.push(createdIssue);
          }

          await this.syncIssueStatusComment(issueNumber, {
            status: "complete",
            phase: "planned",
            iteration: activeRun.record.iteration,
            detail: `Decomposed into ${createdIssues.length} follow-up issues for execution.`
          });
          await this.github.createComment(
            issueNumber,
            [
              result.issueComment || result.summary,
              "",
              result.decomposition.overview,
              "",
              "Created follow-up issues:",
              ...createdIssues.map((child) => `- #${child.number} ${child.title}: ${child.html_url}`)
            ].join("\n")
          );
          await this.github.removeLabel(issueNumber, this.config.runningLabel);
          await this.github.closeIssue(issueNumber, "completed");
          return;
        }
      }

      const nextIteration = activeRun.record.iteration;
      if (nextIteration >= this.config.maxIterationsPerIssue) {
        await this.github.removeLabel(issueNumber, this.config.runningLabel);
        await this.syncIssueStatusComment(issueNumber, {
          status: "queued",
          phase: "paused",
          iteration: nextIteration,
          detail: `Automatic handling paused after ${this.config.maxIterationsPerIssue} iterations. A future retry or human follow-up is needed.`
        });
        await this.github.createComment(
          issueNumber,
          [
            "OpenReactor stopped retrying this issue automatically.",
            "",
            `Reason: exceeded ${this.config.maxIterationsPerIssue} autonomous iterations.`,
            result?.summary ? `Last summary: ${result.summary}` : `Last exit code: ${exitCode ?? "unknown"}.`
          ].join("\n")
        );
        return;
      }

      this.pendingRetries.add(issueNumber);
      await sleep(2_000);

      if (!this.stopped) {
        const refreshedIssue = await this.github.getIssue(issueNumber);
        await this.startIssue(refreshedIssue, {
          ...activeRun.record,
          status: "retry",
          lastResult: result,
          lastError: result ? "" : `codex exited with code ${exitCode ?? "unknown"}`
        }, activeRun.record.agentTool ?? DEFAULT_AGENT_TOOL);
      }
    } catch (error) {
      await this.github.removeLabel(issueNumber, this.config.runningLabel);
      await this.syncIssueStatusComment(issueNumber, {
        status: "queued",
        phase: "error",
        detail: `The reactor hit an execution error: ${formatError(error)}`
      });
      await this.github.createComment(
        issueNumber,
        `OpenReactor failed to continue issue #${issueNumber}: ${formatError(error)}`
      );
    } finally {
      this.pendingRetries.delete(issueNumber);
      if (this.activeRuns.get(issueNumber) === activeRun) {
        this.activeRuns.delete(issueNumber);
      }
    }
  }

  private async validateAcceptedResult(
    branchName: string,
    result: AgentResult
  ): Promise<
    | { ok: true; pullRequest: GitHubPullRequest }
    | { ok: false; reason: string }
  > {
    if (!result.branchName || result.branchName !== branchName) {
      return { ok: false, reason: `accepted result must report branch ${branchName}` };
    }

    if (!result.tests.length) {
      return { ok: false, reason: "accepted result must report at least one quality check" };
    }

    if (!result.tests.some((test) => test.status === "passed")) {
      return { ok: false, reason: "accepted result must report at least one passing quality check" };
    }

    if (result.tests.some((test) => test.status === "failed")) {
      return { ok: false, reason: "accepted result reported a failed quality check" };
    }

    const branchExists = await ensureRemoteBranchExists(this.config.repoRoot, branchName);
    if (!branchExists) {
      return { ok: false, reason: `remote branch ${branchName} was not found on origin` };
    }

    const openPullRequest = await this.github.findOpenPullRequestByBranch(branchName);
    if (openPullRequest) {
      return { ok: true, pullRequest: openPullRequest };
    }

    const mergedPullRequest = await this.github.findPullRequestByBranch(branchName, "all");
    if (!mergedPullRequest) {
      return { ok: false, reason: `no pull request found for branch ${branchName}` };
    }

    const merged = await this.github.isPullRequestMerged(mergedPullRequest.number);
    if (!merged) {
      return {
        ok: false,
        reason: `branch ${branchName} does not have an open or merged pull request`
      };
    }

    return { ok: true, pullRequest: mergedPullRequest };
  }

  private async syncIssueStatusComment(
    issueNumber: number,
    input: {
      status: string;
      phase: string;
      detail: string;
      iteration?: number;
    }
  ): Promise<void> {
    try {
      const body = buildStatusCommentBody(input);
      const existing = await this.findStatusComment(issueNumber);

      if (existing?.body === body) {
        return;
      }

      if (existing) {
        await this.github.updateComment(existing.id, body);
        return;
      }

      await this.github.createComment(issueNumber, body);
    } catch (error) {
      console.warn(`Unable to sync status comment for issue #${issueNumber}.`, error);
    }
  }

  private async findStatusComment(issueNumber: number): Promise<GitHubIssueComment | null> {
    const comments = await this.github.listIssueComments(issueNumber);
    return comments.find((comment) => comment.body.includes(STATUS_COMMENT_MARKER)) ?? null;
  }
}

function buildStatusCommentBody(input: {
  status: string;
  phase: string;
  detail: string;
  iteration?: number;
}): string {
  const lines = [
    STATUS_COMMENT_MARKER,
    "",
    `OpenReactor status: ${input.status}`,
    `Phase: ${input.phase}`,
    `Detail: ${input.detail}`,
    `Updated: ${new Date().toISOString()}`
  ];

  if (typeof input.iteration === "number") {
    lines.push(`Iteration: ${input.iteration}`);
  }

  return lines.join("\n");
}

function hasConflictingMergeState(value?: string | null): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "dirty" || normalized === "conflicting";
}

function hasKnownCleanMergeState(value?: string | null): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return ["clean", "behind", "blocked", "unstable", "has_hooks", "draft", "unknown"].includes(
    normalized
  );
}

function hasMergeConflict(pullRequest: GitHubPullRequest): boolean {
  if (pullRequest.mergeable === false) {
    return true;
  }

  if (hasConflictingMergeState(pullRequest.mergeable_state)) {
    return true;
  }

  if (pullRequest.mergeable === true || hasKnownCleanMergeState(pullRequest.mergeable_state)) {
    return false;
  }

  return false;
}

function normalizeDecomposedIssueTitle(title: string): string {
  const cleaned = title.trim().replace(/^\[request\]\s*/i, "");
  if (cleaned.toLowerCase().startsWith("[task]")) {
    return cleaned;
  }

  return `[Task] ${cleaned}`;
}

function ensureParentLinkInDecomposedIssueBody(issue: GitHubIssue, body: string): string {
  const trimmed = body.trim();
  if (trimmed.includes(`Parent request: #${issue.number}`) || trimmed.includes(issue.html_url)) {
    return trimmed;
  }

  return [
    `Parent request: #${issue.number} ${issue.html_url}`,
    "",
    trimmed
  ].join("\n");
}

function parseIssueNumberFromBranch(branchPrefix: string, branchName: string): number | null {
  if (!branchName.startsWith(branchPrefix)) {
    return null;
  }

  const suffix = branchName.slice(branchPrefix.length).trim();
  if (!/^\d+$/.test(suffix)) {
    return null;
  }

  return Number.parseInt(suffix, 10);
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const dryRun = process.argv.includes("--dry-run");
  const reactor = new Reactor(dryRun);
  let stopping = false;

  const handleStopSignal = () => {
    if (stopping) {
      return;
    }
    stopping = true;
    reactor.stop();
    process.exit(0);
  };

  process.on("SIGINT", handleStopSignal);
  process.on("SIGTERM", handleStopSignal);

  await reactor.start(once);
}

function getLabelNames(issue: GitHubIssue): Set<string> {
  return new Set(
    issue.labels.map((label) => (label.name ?? "").trim().toLowerCase()).filter(Boolean)
  );
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

void main();
