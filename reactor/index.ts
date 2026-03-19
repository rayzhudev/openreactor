import process from "node:process";
import { loadConfig, type OrchestratorConfig } from "./config";
import {
  DEFAULT_AGENT_TOOL,
  getAgentTool,
  isAgentToolName,
  type AgentToolName
} from "./agent-tools";
import { writeReactorLiveSnapshot } from "./live-status";
import {
  GitHubClient,
  type GitHubIssue,
  type GitHubIssueComment,
  type GitHubPullRequest
} from "./github";
import { buildExecutionFooter, renderBodyWithExecutionFooter } from "./execution-footer";
import {
  type AgentResult,
  type ExecutionMetadata,
  createInitialRunRecord,
  ensureRemoteBranchExists,
  ensureIssueWorktree,
  ensureRuntimeDirectories,
  finalizeIssueAgentRun,
  issueHasReferenceImages,
  issueRuntimePaths,
  listChangedFilesForBranch,
  readRunRecord,
  runIssueTriage,
  spawnIssueAgent,
  writeIssueContext,
  writeRunRecord,
  type ActiveRun,
  type IssueRuntimePaths,
  type RunRecord,
  type TriageResult
} from "./runner";

const STATUS_COMMENT_MARKER = "<!-- openreactor:status -->";
const DECISION_COMMENT_MARKER = "<!-- openreactor:decision -->";
const FEEDBACK_BANK_LABEL = "feedback-bank";
const NEEDS_REFINEMENT_LABEL = "needs-refinement";
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
  private readonly blockedDependencyCache = new Map<number, boolean>();
  private stopped = false;

  constructor(private readonly dryRun: boolean) {
    this.config = loadConfig();
    this.github = new GitHubClient(this.config);
  }

  async start(once: boolean): Promise<void> {
    await ensureRuntimeDirectories(this.config);
    await this.ensureLabels();
    await this.updateLiveStatus();

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
    void this.updateLiveStatus();
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
      NEEDS_REFINEMENT_LABEL,
      "d4c5f9",
      "This request is deferred until it gets more specification or clarification."
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
      this.config.maintainerSteeredLabel,
      "5319e7",
      "Trusted signal that this issue is maintainer-steered and may exceed normal product-direction filters."
    );
    await this.github.ensureLabel(
      this.config.authenticatedSubmitterLabel,
      "0e8a16",
      "Trusted signal that the submitter identity came from an authenticated GitHub account."
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
    this.blockedDependencyCache.clear();
    await this.reconcileStaleActiveRuns();

    const discussionRequeuedIssues = this.dryRun
      ? []
      : await this.requeueIssuesFromDiscussion();
    const issues = await this.github.listOpenIssues();
    const candidates = Array.from(
      new Map(
        issues
          .concat(discussionRequeuedIssues)
          .map((issue) => [issue.number, issue] as const)
      ).values()
    ).filter((issue) => this.isRelevantIssue(issue));

    if (this.dryRun) {
      const eligible = [];
      for (const issue of candidates) {
        if (await this.isEligibleForClaim(issue)) {
          eligible.push(issue);
        }
      }
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

      if (!(await this.isEligibleForClaim(issue))) {
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

    await this.updateLiveStatus();
  }

  private async triageIssue(issue: GitHubIssue): Promise<TriageResult | null> {
    const paths = issueRuntimePaths(this.config, issue.number);
    const accessToken = await this.github.getAgentAccessToken();
    const comments = await this.github.listIssueComments(issue.number);
    const { result, execution } = await runIssueTriage({
      config: this.config,
      issue,
      paths,
      githubToken: accessToken,
      comments
    });
    const maintainerSteering = Boolean(getMaintainerSteeringSignal(this.config, issue));
    const normalizedResult = normalizeTriageResult(result, maintainerSteering);

    if (normalizedResult) {
      await this.syncGovernanceLabels(issue.number, normalizedResult);
    }

    if (normalizedResult?.outcome === "reject") {
      await this.persistDormantIssueRecord(issue, paths, comments, "rejected", {
        lastError: normalizedResult.summary,
        triageExecution: execution
      });
      await this.syncIssueStatusComment(issue.number, {
        status: "rejected",
        phase: "triage",
        detail: "Rejected during lightweight triage as not worth pursuing in the current product direction.",
        execution
      });
      await this.github.createComment(
        issue.number,
        formatPublicDecisionComment(
          normalizedResult.issueComment || normalizedResult.summary,
          normalizedResult.considerations,
          execution,
          "Triage"
        )
      );
      await this.github.addLabels(issue.number, [this.config.rejectedLabel]);
      await this.github.removeLabel(issue.number, this.config.runningLabel);
      await this.github.closeIssue(issue.number, "not_planned");
      return null;
    }

    if (normalizedResult?.outcome === "bank") {
      await this.persistDormantIssueRecord(issue, paths, comments, "banked", {
        lastError:
          normalizedResult.bankReason ??
          normalizedResult.summary,
        triageExecution: execution
      });
      await this.github.addLabels(issue.number, [FEEDBACK_BANK_LABEL, NEEDS_REFINEMENT_LABEL]);
      await this.syncIssueStatusComment(issue.number, {
        status: "needs-refinement",
        phase: "banked",
        detail:
          [
            normalizedResult.bankReason ??
              `Banked for later because the current evidence is ${normalizedResult.evidenceStrength} for a ${normalizedResult.sensitivity}-sensitivity change.`,
            `Target surface: ${normalizedResult.targetSurface}.`
          ].join(" "),
        execution
      });
      await this.github.createComment(
        issue.number,
        formatPublicDecisionComment(
          normalizedResult.issueComment ||
            [
              "OpenReactor banked this feedback for later consideration instead of acting on it immediately.",
              "",
              `Target surface: ${normalizedResult.targetSurface}`,
              `Sensitivity: ${normalizedResult.sensitivity}`,
              `Evidence strength: ${normalizedResult.evidenceStrength}`,
              `Evidence summary: ${normalizedResult.evidenceSummary}`,
              normalizedResult.bankReason ? `Reason: ${normalizedResult.bankReason}` : ""
            ].filter(Boolean).join("\n"),
          normalizedResult.considerations,
          execution,
          "Triage"
        )
      );
      await this.github.removeLabel(issue.number, this.config.runningLabel);
      return null;
    }

    if (normalizedResult?.outcome === "dispatch") {
      await this.persistTriageExecution(issue, paths, execution);
      await this.github.removeLabel(issue.number, FEEDBACK_BANK_LABEL);
      await this.github.removeLabel(issue.number, NEEDS_REFINEMENT_LABEL);
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
            `Target surface: ${normalizedResult.targetSurface}.`,
            `Sensitivity: ${normalizedResult.sensitivity}.`,
            `Evidence: ${normalizedResult.evidenceStrength}.`,
            normalizedResult.evidenceSummary
          ].join(" "),
        execution
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
      considerations: ["Triage result was incomplete, so the reactor fell back to the default implementation path."],
      targetSurface: "main",
      sensitivity: "medium",
      evidenceStrength: "moderate",
      evidenceSummary: "Fallback classification because the triage result was incomplete.",
      bankReason: null,
      toolName: DEFAULT_AGENT_TOOL,
      toolReason: "Fallback dispatch to the default implementation tool."
    };
    await this.persistTriageExecution(issue, paths, execution);
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

  private async requeueIssuesFromDiscussion(): Promise<GitHubIssue[]> {
    const recentIssues = await this.github.listRecentlyUpdatedIssues("all");
    const requeuedIssues: GitHubIssue[] = [];

    for (const issue of recentIssues) {
      if (this.activeRuns.has(issue.number) || this.pendingRetries.has(issue.number)) {
        continue;
      }

      const labels = getLabelNames(issue);
      if (labels.has(this.config.acceptedLabel) || labels.has(MAINTAINER_ACTION_REQUIRED_LABEL)) {
        continue;
      }

      const discussionBlocked =
        labels.has(FEEDBACK_BANK_LABEL) ||
        labels.has(NEEDS_REFINEMENT_LABEL) ||
        labels.has(this.config.pausedLabel) ||
        labels.has(this.config.rejectedLabel);
      if (!discussionBlocked) {
        continue;
      }

      const paths = issueRuntimePaths(this.config, issue.number);
      const comments = await this.github.listIssueComments(issue.number);
      const latestComment = findLatestRelevantDiscussionComment(comments);
      if (!latestComment) {
        continue;
      }

      const record = await readRunRecord(paths);
      const lastSeenAt = this.lastSeenDiscussionTimestamp(issue, comments, record);
      if (!isNewerIsoTimestamp(latestComment.updated_at, lastSeenAt)) {
        continue;
      }

      const maintainerComment =
        latestComment.user?.login?.toLowerCase() === this.config.owner.toLowerCase();
      const botMentioned = commentMentionsBot(latestComment.body, this.config.botMentionAliases);
      const closedIssueExplicitRetrigger = issue.state !== "closed" || botMentioned;
      const allowRequeue =
        closedIssueExplicitRetrigger &&
        (labels.has(FEEDBACK_BANK_LABEL) ||
          labels.has(NEEDS_REFINEMENT_LABEL) ||
          labels.has(this.config.pausedLabel) ||
          maintainerComment ||
          botMentioned);

      if (!allowRequeue) {
        continue;
      }

      if (issue.state === "closed") {
        await this.github.reopenIssue(issue.number);
      }

      await this.github.removeLabel(issue.number, this.config.rejectedLabel);
      await this.github.removeLabel(issue.number, FEEDBACK_BANK_LABEL);
      await this.github.removeLabel(issue.number, NEEDS_REFINEMENT_LABEL);
      await this.github.removeLabel(issue.number, this.config.pausedLabel);

      const nextRecord = record ?? (await createInitialRunRecord(issue, paths));
      nextRecord.status = "retry";
      nextRecord.lastError = "";
      nextRecord.lastDiscussionCommentAt = latestComment.updated_at;
      nextRecord.updatedAt = new Date().toISOString();
      nextRecord.lastHeartbeatAt = nextRecord.updatedAt;
      await writeRunRecord(paths, nextRecord);

      await this.syncIssueStatusComment(issue.number, {
        status: "queued",
        phase: "discussion",
        detail:
          botMentioned || maintainerComment
            ? "New discussion explicitly requested retriage, so OpenReactor is reconsidering this issue."
            : "New discussion refined the issue, so OpenReactor is reconsidering it."
      });

      requeuedIssues.push(await this.github.getIssue(issue.number));
    }

    return requeuedIssues;
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

  private async isEligibleForClaim(issue: GitHubIssue): Promise<boolean> {
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

    if (labels.has(NEEDS_REFINEMENT_LABEL)) {
      return false;
    }

    if (labels.has(MAINTAINER_ACTION_REQUIRED_LABEL)) {
      return false;
    }

    if (labels.has(this.config.acceptedLabel) || labels.has(this.config.rejectedLabel)) {
      return false;
    }

    if (await this.hasOpenBlockingDependencies(issue.number)) {
      return false;
    }

    return true;
  }

  private async persistDormantIssueRecord(
    issue: GitHubIssue,
    paths: IssueRuntimePaths,
    comments: GitHubIssueComment[],
    status: "banked" | "rejected",
    input?: {
      lastError?: string;
      triageExecution?: ExecutionMetadata;
    }
  ): Promise<void> {
    const record = (await readRunRecord(paths)) ?? (await createInitialRunRecord(issue, paths));
    const latestComment = findLatestRelevantDiscussionComment(comments);
    const now = new Date().toISOString();

    record.status = status;
    record.issueTitle = issue.title;
    record.updatedAt = now;
    record.lastHeartbeatAt = now;
    record.lastDiscussionCommentAt =
      latestComment?.updated_at ??
      record.lastDiscussionCommentAt ??
      issue.updated_at ??
      issue.created_at;
    record.triageExecution = input?.triageExecution ?? record.triageExecution ?? null;
    record.lastError = input?.lastError ?? record.lastError;

    await writeRunRecord(paths, record);
  }

  private async persistTriageExecution(
    issue: GitHubIssue,
    paths: IssueRuntimePaths,
    execution: ExecutionMetadata
  ): Promise<void> {
    const record = (await readRunRecord(paths)) ?? (await createInitialRunRecord(issue, paths));
    record.issueTitle = issue.title;
    record.triageExecution = execution;
    record.updatedAt = new Date().toISOString();
    record.lastHeartbeatAt = record.updatedAt;
    await writeRunRecord(paths, record);
  }

  private lastSeenDiscussionTimestamp(
    issue: GitHubIssue,
    comments: GitHubIssueComment[],
    record: RunRecord | null
  ): string {
    if (record) {
      return record.lastDiscussionCommentAt ?? record.updatedAt ?? record.createdAt;
    }

    return (
      findLatestReactorCommentTimestamp(comments) ??
      issue.created_at
    );
  }

  private async startIssue(
    issue: GitHubIssue,
    existingRecord?: RunRecord,
    selectedTriage?: TriageResult
  ): Promise<void> {
    const paths = issueRuntimePaths(this.config, issue.number);
    const requestedAgentTool = isAgentToolName(selectedTriage?.toolName)
      ? selectedTriage.toolName
      : existingRecord?.agentTool ?? DEFAULT_AGENT_TOOL;
    const record =
      existingRecord ??
      (await readRunRecord(paths)) ??
      (await createInitialRunRecord(issue, paths));
    record.targetSurface = selectedTriage?.targetSurface ?? record.targetSurface;
    record.sensitivity = selectedTriage?.sensitivity ?? record.sensitivity;
    record.evidenceStrength = selectedTriage?.evidenceStrength ?? record.evidenceStrength;
    record.evidenceSummary = selectedTriage?.evidenceSummary ?? record.evidenceSummary;

    try {
      const comments = await this.github.listIssueComments(issue.number);
      const hasReferenceImages = issueHasReferenceImages(issue, comments);
      const agentTool =
        requestedAgentTool === "spawn_claude_ui_agent" && hasReferenceImages
          ? "spawn_codex_issue_agent"
          : requestedAgentTool;
      record.agentTool = agentTool;
      await ensureIssueWorktree(this.config, paths);
      const referenceImages = await writeIssueContext(this.config, issue, paths, {
        targetSurface: record.targetSurface,
        sensitivity: record.sensitivity,
        evidenceStrength: record.evidenceStrength,
        evidenceSummary: record.evidenceSummary
      }, comments);
      await writeRunRecord(paths, record);
      await this.syncIssueStatusComment(issue.number, {
        status: "in-progress",
        phase: existingRecord ? "retrying" : "reviewing",
        iteration: record.iteration + 1,
        detail: [
          existingRecord
            ? `Retry iteration ${record.iteration + 1} is running after the previous attempt ended without a final decision.`
            : "Full issue agent is reviewing the request and deciding the best product change.",
          requestedAgentTool === "spawn_claude_ui_agent" && hasReferenceImages
            ? "OpenReactor routed this run through Codex because reference images are attached and the current Claude CLI path does not yet support deterministic image attachments."
            : "",
          referenceImages.length
            ? `Attached ${referenceImages.length} reference image${referenceImages.length === 1 ? "" : "s"} to the agent input.`
            : ""
        ].filter(Boolean).join(" ")
      });

      const accessToken = await this.github.getAgentAccessToken();
      const activeRun = await spawnIssueAgent({
        config: this.config,
        issue,
        paths,
        record,
        githubToken: accessToken,
        referenceImages
      });

      this.activeRuns.set(issue.number, activeRun);
      void this.updateLiveStatus();
      void this.handleRunCompletion(activeRun);
    } catch (error) {
      await this.handleStartFailure(issue, {
        phase: existingRecord ? "retry-startup" : "startup",
        error,
        record,
        selectedTool: record.agentTool ?? requestedAgentTool
      });
    }
  }

  private async syncGovernanceLabels(issueNumber: number, triage: TriageResult): Promise<void> {
    const labelsToClear = [
      FEEDBACK_BANK_LABEL,
      NEEDS_REFINEMENT_LABEL,
      ...Object.values(SENSITIVITY_LABELS),
      ...Object.values(EVIDENCE_LABELS)
    ];

    for (const label of labelsToClear) {
      await this.github.removeLabel(issueNumber, label);
    }

    await this.github.addLabels(issueNumber, [
      SENSITIVITY_LABELS[triage.sensitivity],
      EVIDENCE_LABELS[triage.evidenceStrength],
      ...(triage.outcome === "bank" ? [FEEDBACK_BANK_LABEL, NEEDS_REFINEMENT_LABEL] : [])
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
          await this.refreshPullRequestExecutionFooter(handoffValidation.pullRequest.number, paths);
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
            detail: `Waiting on maintainer action before PR ${handoffValidation.pullRequest.html_url} can continue.`,
            execution: activeRun.record.lastAgentExecution ?? undefined
          });
          await this.github.createComment(
            issueNumber,
            formatPublicDecisionComment(
              [
                result.issueComment || result.summary,
                "",
                `OpenReactor left PR ${handoffValidation.pullRequest.html_url} open and disabled auto-merge because a maintainer-only action is still required.`,
                "",
                "Maintainer action required:",
                result.humanHandoff.instructions
              ].join("\n"),
              result.considerations,
              activeRun.record.lastAgentExecution,
              "Implementation"
            )
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
          await this.refreshPullRequestExecutionFooter(acceptedValidation.pullRequest.number, paths);
          await this.syncIssueStatusComment(issueNumber, {
            status: "complete",
            phase: "accepted",
            iteration: activeRun.record.iteration,
            detail: `Accepted and linked to PR ${acceptedValidation.pullRequest.html_url}.`,
            execution: activeRun.record.lastAgentExecution ?? undefined
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
          detail: result.summary,
          execution: activeRun.record.lastAgentExecution ?? undefined
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
          const inheritedLabels = getInheritedTrustedLabels(this.config, activeRun.issue);
          for (const child of result.decomposition.childIssues) {
            const title = normalizeDecomposedIssueTitle(child.title);
            const body = ensureInheritedIssueMetadata(
              this.config,
              activeRun.issue,
              ensureParentLinkInDecomposedIssueBody(activeRun.issue, child.body)
            );
            const createdIssue = await this.github.createIssue({
              title,
              body,
              labels: inheritedLabels
            });
            if (!createdIssue.id) {
              throw new Error(
                `GitHub did not return an id for decomposed issue #${createdIssue.number}.`
              );
            }
            await this.github.addSubIssue(issueNumber, createdIssue.id);
            createdIssues.push(createdIssue);
          }

          for (const [index, child] of result.decomposition.childIssues.entries()) {
            const issue = createdIssues[index];
            if (!issue?.id) {
              throw new Error(`Missing GitHub id for decomposed child issue at index ${index}.`);
            }

            for (const dependencyIndex of normalizeDependencyIndexes(
              child.dependsOn,
              result.decomposition.childIssues.length,
              index
            )) {
              const blockingIssue = createdIssues[dependencyIndex];
              if (!blockingIssue?.id) {
                throw new Error(
                  `Missing GitHub id for dependency child issue at index ${dependencyIndex}.`
                );
              }

              await this.github.addBlockedByDependency(issue.number, blockingIssue.id);
            }
          }

          await this.syncIssueStatusComment(issueNumber, {
            status: "complete",
            phase: "planned",
            iteration: activeRun.record.iteration,
            detail: `Decomposed into ${createdIssues.length} follow-up issues for execution.`,
            execution: activeRun.record.lastAgentExecution ?? undefined
          });
          await this.github.createComment(
            issueNumber,
            formatPublicDecisionComment(
              [
                result.issueComment || result.summary,
                "",
                result.decomposition.overview,
                "",
                "Created follow-up issues:",
                ...createdIssues.map((child) => `- #${child.number} ${child.title}: ${child.html_url}`)
              ].join("\n"),
              result.considerations,
              activeRun.record.lastAgentExecution,
              "Implementation"
            )
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
      await this.updateLiveStatus();
    }
  }

  private async refreshPullRequestExecutionFooter(
    pullRequestNumber: number,
    paths: IssueRuntimePaths
  ): Promise<void> {
    const pullRequest = await this.github.getPullRequest(pullRequestNumber);
    const currentBody = pullRequest.body ?? "";
    const footer = await buildExecutionFooter(paths.runDir);
    const nextBody = renderBodyWithExecutionFooter(currentBody, footer);
    if (nextBody === currentBody) {
      return;
    }

    await this.github.updatePullRequest(pullRequestNumber, { body: nextBody });
  }

  private async hasOpenBlockingDependencies(issueNumber: number): Promise<boolean> {
    if (this.blockedDependencyCache.has(issueNumber)) {
      return this.blockedDependencyCache.get(issueNumber) ?? false;
    }

    const blockedByIssues = await this.github.listBlockedByDependencies(issueNumber);
    const hasOpenDependencies = blockedByIssues.some((issue) => issue.state === "open");
    this.blockedDependencyCache.set(issueNumber, hasOpenDependencies);
    return hasOpenDependencies;
  }

  private async updateLiveStatus(): Promise<void> {
    const activeAgents = Array.from(this.activeRuns.values()).map((activeRun) => {
      const tool = getAgentTool(activeRun.record.agentTool);

      return {
        issueNumber: activeRun.issue.number,
        issueTitle: activeRun.issue.title,
        issueUrl: activeRun.issue.html_url,
        branchName: activeRun.record.branchName,
        iteration: activeRun.record.iteration,
        targetSurface: activeRun.record.targetSurface,
        toolName: tool.name,
        toolLabel: tool.label,
        provider: tool.provider,
        providerLabel: activeRun.executionTemplate.providerLabel,
        model: activeRun.executionTemplate.model,
        reasoningEffort: activeRun.executionTemplate.reasoningEffort,
        serviceTier: activeRun.executionTemplate.serviceTier,
        primaryUse: tool.primaryUse,
        sensitivity: activeRun.record.sensitivity,
        evidenceStrength: activeRun.record.evidenceStrength,
        startedAt: new Date(activeRun.startedAt).toISOString(),
        updatedAt: activeRun.record.updatedAt,
        lastHeartbeatAt: activeRun.record.lastHeartbeatAt,
        status: activeRun.record.status,
        summary: activeRun.record.lastResult?.summary ?? null,
        runDir: activeRun.record.runDir
      };
    });

    await writeReactorLiveSnapshot(this.config.repoRoot, {
      generatedAt: new Date().toISOString(),
      reactor: {
        pid: process.pid,
        dryRun: this.dryRun,
        pollIntervalMs: this.config.pollIntervalMs,
        maxConcurrentIssues: this.config.maxConcurrentIssues,
        maxIterationRuntimeMs: this.config.maxIterationRuntimeMs,
        activeRunCount: activeAgents.length,
        pendingRetryCount: this.pendingRetries.size
      },
      activeAgents
    });
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
      execution?: ExecutionMetadata;
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
  execution?: ExecutionMetadata;
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

  if (input.execution) {
    lines.push(`Execution: ${formatExecutionLine(input.execution)}`);
  }

  return lines.join("\n");
}

function formatPublicDecisionComment(
  body: string,
  considerations: string[] | null | undefined,
  execution: ExecutionMetadata | null | undefined,
  stageLabel: string
): string {
  const lines = [body.trim()];
  lines.unshift(DECISION_COMMENT_MARKER, "");

  const formattedConsiderations = formatConsiderations(considerations);
  if (formattedConsiderations.length) {
    lines.push("", "Considered:", ...formattedConsiderations);
  }

  if (execution) {
    lines.push("", `_OpenReactor ${stageLabel}: ${formatExecutionLine(execution)}._`);
  }

  return lines.filter(Boolean).join("\n");
}

function formatConsiderations(considerations: string[] | null | undefined): string[] {
  return (considerations ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((item) => `- ${item}`);
}

function formatExecutionLine(execution: ExecutionMetadata): string {
  const parts = [
    `${execution.providerLabel} ${execution.model}`,
    `reasoning ${execution.reasoningEffort}`,
    execution.serviceTier ? `service tier ${execution.serviceTier}` : null,
    execution.toolLabel ? `tool ${execution.toolLabel}` : null,
    `duration ${formatDurationMs(execution.durationMs)}`
  ].filter(Boolean);

  return parts.join(" • ");
}

function formatDurationMs(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${totalSeconds}s`;
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

function normalizeDependencyIndexes(
  indexes: number[] | null | undefined,
  totalChildren: number,
  selfIndex: number
): number[] {
  return Array.from(
    new Set(
      (indexes ?? []).filter(
        (value) =>
          Number.isInteger(value) &&
          value >= 0 &&
          value < totalChildren &&
          value !== selfIndex
      )
    )
  ).sort((left, right) => left - right);
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
  config: Pick<OrchestratorConfig, "owner" | "maintainerSteeredLabel">,
  issue: Pick<GitHubIssue, "body" | "labels" | "user">
): { username: string } | null {
  const authorLogin = normalizeGitHubUsername(issue.user?.login ?? null);
  if (authorLogin && authorLogin.toLowerCase() === config.owner.toLowerCase()) {
    return { username: authorLogin };
  }

  if (!issueHasLabel(issue, config.maintainerSteeredLabel)) {
    return null;
  }

  const username = normalizeGitHubUsername(readStructuredIssueField(issue.body, "GitHub Username"));
  if (username && username.toLowerCase() === config.owner.toLowerCase()) {
    return { username };
  }

  return { username: config.owner };
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
    (label) => (label.name ?? "").trim().toLowerCase() === labelName.toLowerCase()
  );
}

function getInheritedTrustedLabels(
  config: Pick<
    OrchestratorConfig,
    "owner" | "maintainerSteeredLabel" | "authenticatedSubmitterLabel"
  >,
  issue: Pick<GitHubIssue, "body" | "labels" | "user">
): string[] {
  const inherited = new Set<string>();
  if (getTrustedSubmitterUsername(config, issue)) {
    inherited.add(config.authenticatedSubmitterLabel);
  }
  if (getMaintainerSteeringSignal(config, issue)) {
    inherited.add(config.maintainerSteeredLabel);
  }
  return Array.from(inherited);
}

function ensureInheritedIssueMetadata(
  config: Pick<
    OrchestratorConfig,
    "owner" | "maintainerSteeredLabel" | "authenticatedSubmitterLabel"
  >,
  issue: Pick<GitHubIssue, "body" | "labels" | "user">,
  childBody: string
): string {
  const githubUsername =
    readStructuredIssueField(issue.body, "GitHub Username") ??
    getTrustedSubmitterUsername(config, issue);
  const submissionIdentity = readStructuredIssueField(issue.body, "Submission Identity");
  const additions: string[] = [];

  if (githubUsername && !/## GitHub Username/i.test(childBody)) {
    additions.push("## GitHub Username", githubUsername.trim(), "");
  }

  if (submissionIdentity && !/## Submission Identity/i.test(childBody)) {
    additions.push("## Submission Identity", submissionIdentity.trim(), "");
  }

  if (!additions.length) {
    return childBody;
  }

  return `${childBody.trim()}\n\n${additions.join("\n").trim()}\n`;
}

function getTrustedSubmitterUsername(
  config: Pick<
    OrchestratorConfig,
    "owner" | "maintainerSteeredLabel" | "authenticatedSubmitterLabel"
  >,
  issue: Pick<GitHubIssue, "body" | "labels" | "user">
): string | null {
  const authorLogin = normalizeGitHubUsername(issue.user?.login ?? null);
  if (authorLogin && !/\[bot\]$/i.test(authorLogin)) {
    return authorLogin;
  }

  if (
    issueHasLabel(issue, config.authenticatedSubmitterLabel) ||
    issueHasLabel(issue, config.maintainerSteeredLabel)
  ) {
    return normalizeGitHubUsername(readStructuredIssueField(issue.body, "GitHub Username"));
  }

  return null;
}

function normalizeTriageResult(
  result: TriageResult | null,
  maintainerSteering: boolean
): TriageResult | null {
  if (!result) {
    return null;
  }

  if (result.targetSurface === "playground") {
    result = {
      ...result,
      sensitivity: "low",
      evidenceStrength: result.evidenceStrength === "weak" ? "moderate" : result.evidenceStrength,
      evidenceSummary:
        result.evidenceSummary ||
        "Playground-targeted requests are intentionally lower-sensitivity than the core site."
    };
  }

  if (result.targetSurface === "openreactor-core") {
    result = {
      ...result,
      sensitivity: "high",
      evidenceSummary:
        result.evidenceSummary ||
        "OpenReactor-core changes are maintainer-controlled and should be treated as high-sensitivity by default."
    };
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

function findLatestRelevantDiscussionComment(
  comments: GitHubIssueComment[]
): GitHubIssueComment | null {
  const relevant = comments.filter((comment) => isRelevantDiscussionComment(comment));
  return relevant.at(-1) ?? null;
}

function findLatestReactorCommentTimestamp(comments: GitHubIssueComment[]): string | null {
  const reactorComments = comments.filter((comment) => {
    const body = comment.body?.trim() ?? "";
    const login = comment.user?.login?.toLowerCase() ?? "";
    return (
      body.includes(STATUS_COMMENT_MARKER) ||
      body.includes(DECISION_COMMENT_MARKER) ||
      body.includes("<!-- openreactor:watchdog -->") ||
      body.includes("<!-- openreactor:agent-result -->") ||
      login.endsWith("[bot]")
    );
  });

  return reactorComments.at(-1)?.updated_at ?? null;
}

function isRelevantDiscussionComment(comment: GitHubIssueComment): boolean {
  const body = comment.body?.trim() ?? "";
  if (!body) {
    return false;
  }

  if (
    body.includes(STATUS_COMMENT_MARKER) ||
    body.includes(DECISION_COMMENT_MARKER) ||
    body.includes("<!-- openreactor:watchdog -->") ||
    body.includes("<!-- openreactor:agent-result -->")
  ) {
    return false;
  }

  const login = comment.user?.login?.toLowerCase() ?? "";
  if (login.endsWith("[bot]")) {
    return false;
  }

  return true;
}

function commentMentionsBot(body: string, aliases: string[]): boolean {
  const normalizedBody = body.toLowerCase();
  return aliases.some((alias) => normalizedBody.includes(alias.toLowerCase()));
}

function isNewerIsoTimestamp(left: string, right: string): boolean {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (!Number.isFinite(leftTime)) {
    return false;
  }

  if (!Number.isFinite(rightTime)) {
    return true;
  }

  return leftTime > rightTime;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

void main();
