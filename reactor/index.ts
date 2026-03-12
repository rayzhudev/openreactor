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
  listChangedFilesForBranch,
  readRunRecord,
  runIssueTriage,
  spawnIssueAgent,
  writeIssueContext,
  writeRunRecord,
  type ActiveRun,
  type RunRecord,
  type TriageResult
} from "./runner";

const STATUS_COMMENT_MARKER = "<!-- openreactor:status -->";
const FEEDBACK_BANK_LABEL = "feedback-bank";
const OPENREACTOR_CORE_LABEL = "openreactor-core";
const MAINTAINER_ACTION_REQUIRED_LABEL = "maintainer-action-required";
const SENSITIVITY_LABELS = {
  low: "sensitivity:low",
  medium: "sensitivity:medium",
  high: "sensitivity:high"
} as const;
const EVIDENCE_LABELS = {
  weak: "evidence:weak",
  moderate: "evidence:moderate",
  strong: "evidence:strong"
} as const;

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
      FEEDBACK_BANK_LABEL,
      "c2e0c6",
      "OpenReactor banked this feedback for later consideration instead of acting on it immediately."
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
    await this.github.ensureLabel(
      SENSITIVITY_LABELS.low,
      "0e8a16",
      "This request likely affects a low-sensitivity surface such as a side page or isolated experiment."
    );
    await this.github.ensureLabel(
      SENSITIVITY_LABELS.medium,
      "fbca04",
      "This request likely affects a medium-sensitivity surface such as navigation or shared UI patterns."
    );
    await this.github.ensureLabel(
      SENSITIVITY_LABELS.high,
      "d73a4a",
      "This request likely affects a high-sensitivity surface such as the homepage, OpenReactor workflow, or privileged internals."
    );
    await this.github.ensureLabel(
      EVIDENCE_LABELS.weak,
      "8b949e",
      "Current supporting evidence for acting on this request is weak."
    );
    await this.github.ensureLabel(
      EVIDENCE_LABELS.moderate,
      "1f6feb",
      "Current supporting evidence for acting on this request is moderate."
    );
    await this.github.ensureLabel(
      EVIDENCE_LABELS.strong,
      "238636",
      "Current supporting evidence for acting on this request is strong."
    );
    await this.github.ensureLabel(
      OPENREACTOR_CORE_LABEL,
      "5319e7",
      "This issue pertains to OpenReactor itself rather than the product surface."
    );
    await this.github.ensureLabel(
      MAINTAINER_ACTION_REQUIRED_LABEL,
      "b60205",
      "OpenReactor prepared a PR for this issue but is waiting on a maintainer-only action before it can continue."
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
      let triageDecision: TriageResult | null = null;
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

  private async triageIssue(issue: GitHubIssue): Promise<TriageResult | null> {
    const paths = issueRuntimePaths(this.config, issue.number);
    const accessToken = await this.github.getAgentAccessToken();
    const { result } = await runIssueTriage({
      config: this.config,
      issue,
      paths,
      githubToken: accessToken
    });
    const maintainerSteering = Boolean(getMaintainerSteeringSignal(this.config, issue));
    const normalizedResult = normalizeTriageResult(result, maintainerSteering);

    if (normalizedResult) {
      await this.syncGovernanceLabels(issue.number, normalizedResult);
    }

    if (normalizedResult?.outcome === "reject") {
      await this.syncIssueStatusComment(issue.number, {
        status: "rejected",
        phase: "triage",
        detail: "Rejected during lightweight triage as not worth pursuing in the current product direction."
      });
      await this.github.createComment(
        issue.number,
        normalizedResult.issueComment || normalizedResult.summary
      );
      await this.github.addLabels(issue.number, [this.config.rejectedLabel]);
      await this.github.removeLabel(issue.number, this.config.runningLabel);
      await this.github.closeIssue(issue.number, "not_planned");
      return null;
    }

    if (normalizedResult?.outcome === "bank") {
      await this.github.addLabels(issue.number, [FEEDBACK_BANK_LABEL]);
      await this.syncIssueStatusComment(issue.number, {
        status: "queued",
        phase: "banked",
        detail:
          normalizedResult.bankReason ??
          `Banked for later because the current evidence is ${normalizedResult.evidenceStrength} for a ${normalizedResult.sensitivity}-sensitivity change.`
      });
      await this.github.createComment(
        issue.number,
        normalizedResult.issueComment ||
          [
            "OpenReactor banked this feedback for later consideration instead of acting on it immediately.",
            "",
            `Sensitivity: ${normalizedResult.sensitivity}`,
            `Evidence strength: ${normalizedResult.evidenceStrength}`,
            `Evidence summary: ${normalizedResult.evidenceSummary}`,
            normalizedResult.bankReason ? `Reason: ${normalizedResult.bankReason}` : ""
          ].filter(Boolean).join("\n")
      );
      await this.github.removeLabel(issue.number, this.config.runningLabel);
      return null;
    }

    if (normalizedResult?.outcome === "dispatch") {
      await this.github.removeLabel(issue.number, FEEDBACK_BANK_LABEL);
      const toolName = isAgentToolName(normalizedResult.toolName)
        ? normalizedResult.toolName
        : DEFAULT_AGENT_TOOL;
      const tool = getAgentTool(toolName);
      await this.syncIssueStatusComment(issue.number, {
        status: "in-progress",
        phase: toolName === "spawn_codex_planner_agent" ? "planning" : "implementation",
        detail:
          [
            normalizedResult.toolReason ??
              `Lightweight triage selected ${tool.label} for the next implementation attempt.`,
            `Sensitivity: ${normalizedResult.sensitivity}.`,
            `Evidence: ${normalizedResult.evidenceStrength}.`,
            normalizedResult.evidenceSummary
          ].join(" ")
      });
      return {
        ...normalizedResult,
        toolName
      };
    }

    const fallbackResult: TriageResult = {
      issueNumber: issue.number,
      outcome: "dispatch",
      summary: "Defaulted to dispatch because triage result was missing or incomplete.",
      issueComment: null,
      sensitivity: "medium",
      evidenceStrength: "moderate",
      evidenceSummary: "Fallback classification because the triage result was incomplete.",
      bankReason: null,
      toolName: DEFAULT_AGENT_TOOL,
      toolReason: "Fallback dispatch to the default implementation tool."
    };
    await this.syncGovernanceLabels(issue.number, fallbackResult);
    return fallbackResult;
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

      if (record.status === "waiting-maintainer") {
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

    if (labels.has(FEEDBACK_BANK_LABEL)) {
      return false;
    }

    if (labels.has(MAINTAINER_ACTION_REQUIRED_LABEL)) {
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
    selectedTriage?: TriageResult
  ): Promise<void> {
    const paths = issueRuntimePaths(this.config, issue.number);
    const agentTool = isAgentToolName(selectedTriage?.toolName)
      ? selectedTriage.toolName
      : existingRecord?.agentTool ?? DEFAULT_AGENT_TOOL;
    const record = existingRecord ?? (await createInitialRunRecord(issue, paths));
    record.agentTool = agentTool;
    record.sensitivity = selectedTriage?.sensitivity ?? record.sensitivity;
    record.evidenceStrength = selectedTriage?.evidenceStrength ?? record.evidenceStrength;
    record.evidenceSummary = selectedTriage?.evidenceSummary ?? record.evidenceSummary;

    try {
      await ensureIssueWorktree(this.config, paths);
      await writeIssueContext(this.config, issue, paths, {
        sensitivity: record.sensitivity,
        evidenceStrength: record.evidenceStrength,
        evidenceSummary: record.evidenceSummary
      });
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

  private async syncGovernanceLabels(issueNumber: number, triage: TriageResult): Promise<void> {
    const labelsToClear = [
      FEEDBACK_BANK_LABEL,
      ...Object.values(SENSITIVITY_LABELS),
      ...Object.values(EVIDENCE_LABELS)
    ];

    for (const label of labelsToClear) {
      await this.github.removeLabel(issueNumber, label);
    }

    await this.github.addLabels(issueNumber, [
      SENSITIVITY_LABELS[triage.sensitivity],
      EVIDENCE_LABELS[triage.evidenceStrength],
      ...(triage.outcome === "bank" ? [FEEDBACK_BANK_LABEL] : [])
    ]);
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

      if (result?.humanHandoff?.required) {
        const handoffValidation = await this.validateMaintainerHandoff(paths.branchName, result);
        if (!handoffValidation.ok) {
          activeRun.record.status = "retry";
          activeRun.record.lastError = handoffValidation.reason;
          await writeRunRecord(paths, activeRun.record);
        } else {
          activeRun.record.status = "waiting-maintainer";
          activeRun.record.lastError = "";
          activeRun.record.lastResult = {
            ...result,
            prUrl: handoffValidation.pullRequest.html_url
          };
          await writeRunRecord(paths, activeRun.record);
          await this.github.disablePullRequestAutoMerge(handoffValidation.pullRequest.number);
          await this.github.addLabels(issueNumber, [MAINTAINER_ACTION_REQUIRED_LABEL]);
          await this.github.addLabels(handoffValidation.pullRequest.number, [
            MAINTAINER_ACTION_REQUIRED_LABEL
          ]);
          await this.github.removeLabel(issueNumber, this.config.runningLabel);
          await this.syncIssueStatusComment(issueNumber, {
            status: "queued",
            phase: "waiting-maintainer",
            iteration: activeRun.record.iteration,
            detail: `Waiting on maintainer action before PR ${handoffValidation.pullRequest.html_url} can continue.`
          });
          await this.github.createComment(
            issueNumber,
            [
              result.issueComment || result.summary,
              "",
              `OpenReactor left PR ${handoffValidation.pullRequest.html_url} open and disabled auto-merge because a maintainer-only action is still required.`,
              "",
              "Maintainer action required:",
              result.humanHandoff.instructions
            ].join("\n")
          );
          return;
        }
      }

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
        });
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

    const changedFiles = await listChangedFilesForBranch(this.config.repoRoot, branchName);
    if (touchesUiSurface(changedFiles) && !hasBrowserVerificationEvidence(result)) {
      return {
        ok: false,
        reason:
          "accepted UI result must report browser verification evidence in its tests"
      };
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

  private async validateMaintainerHandoff(
    branchName: string,
    result: AgentResult
  ): Promise<
    | { ok: true; pullRequest: GitHubPullRequest }
    | { ok: false; reason: string }
  > {
    const instructions = result.humanHandoff?.instructions.trim() ?? "";
    if (!instructions) {
      return {
        ok: false,
        reason: "maintainer handoff requires explicit continuation instructions"
      };
    }

    if (!result.branchName || result.branchName !== branchName) {
      return { ok: false, reason: `maintainer handoff must report branch ${branchName}` };
    }

    const branchExists = await ensureRemoteBranchExists(this.config.repoRoot, branchName);
    if (!branchExists) {
      return { ok: false, reason: `remote branch ${branchName} was not found on origin` };
    }

    const openPullRequest = await this.github.findOpenPullRequestByBranch(branchName);
    if (!openPullRequest) {
      return {
        ok: false,
        reason: `maintainer handoff requires an open pull request for branch ${branchName}`
      };
    }

    return { ok: true, pullRequest: openPullRequest };
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

function touchesUiSurface(files: string[]): boolean {
  return files.some((file) => {
    if (file === "src/input.css" || file === "UI_SYSTEM.md") {
      return true;
    }

    if (file.startsWith("public/")) {
      return true;
    }

    return false;
  });
}

function hasBrowserVerificationEvidence(result: AgentResult): boolean {
  return result.tests.some((test) => {
    if (test.status !== "passed") {
      return false;
    }

    const command = test.command.toLowerCase();
    return (
      command.includes("agent-browser") ||
      command.includes("playwright") ||
      command.includes("screenshot") ||
      command.includes("snapshot")
    );
  });
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

function getMaintainerSteeringSignal(
  config: Pick<OrchestratorConfig, "owner">,
  issue: Pick<GitHubIssue, "body">
): { username: string } | null {
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

function normalizeTriageResult(
  result: TriageResult | null,
  maintainerSteering: boolean
): TriageResult | null {
  if (!result) {
    return null;
  }

  if (!maintainerSteering && result.outcome === "dispatch") {
    if (result.sensitivity === "high" && result.evidenceStrength === "weak") {
      return {
        ...result,
        outcome: "bank",
        toolName: null,
        toolReason: null,
        summary: "Banked because a high-sensitivity change should not move on weak evidence alone.",
        bankReason:
          result.bankReason ||
          "This looks like a high-sensitivity surface, and the current evidence is too weak to act on it yet without maintainer steering or more supporting feedback.",
        issueComment:
          result.issueComment ||
          [
            "OpenReactor banked this request instead of implementing it immediately.",
            "",
            "Reason: it appears to affect a high-sensitivity surface, but the current evidence is still weak.",
            "If more similar feedback accumulates or the maintainer explicitly steers this direction, it can be promoted later."
          ].join("\n")
      };
    }
  }

  return result;
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
