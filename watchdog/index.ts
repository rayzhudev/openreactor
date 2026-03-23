import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { loadConfig as loadReactorConfig } from "../reactor/config";
import { GitHubClient, type GitHubIssue, type GitHubPullRequest } from "../reactor/github";
import { detectProviderOutage } from "../reactor/provider-outage";
import {
  canDirectlyMergeAcceptedPullRequest,
  hasMergeConflict,
  isExpectedDirectMergeWaitError
} from "../reactor/pull-request-state";
import { appendRunActivity } from "../reactor/runtime-artifacts";
import { issueRuntimePaths, readRunRecord, type RunRecord } from "../reactor/runner";
import { runWorkspacePolicyCommand } from "../reactor/workspace-policy";
import { loadWatchdogConfig, type WatchdogConfig } from "./config";

const WATCHDOG_COMMENT_MARKER = "<!-- openreactor:watchdog -->";
const REPAIR_REQUEST_MARKER = "<!-- openreactor:repair-request -->";
const OPENREACTOR_CORE_LABEL = "openreactor-core";
const MAINTAINER_ACTION_REQUIRED_LABEL = "maintainer-action-required";

type FailureClass =
  | "none"
  | "rate_limit"
  | "auth"
  | "provider_unavailable"
  | "schema_mismatch"
  | "missing_binary"
  | "runaway_iterations"
  | "workflow_deadlock"
  | "service_unhealthy"
  | "github_api"
  | "unknown";

interface FailureInfo {
  className: FailureClass;
  retryable: boolean;
  global: boolean;
  requiresCodeChange: boolean;
}

interface IssueWatchdogState {
  autoHealAttempts: number;
  lastAutoHealAt?: string;
  lastEscalatedAt?: string;
  lastFailureClass?: FailureClass;
  lastSeenHead?: string;
  repairIssueNumber?: number;
  repairIssueOwner?: string;
  repairIssueRepo?: string;
  repairIssueOpenedAt?: string;
  repairIssueMergedAt?: string;
  repairDeployCompletedAt?: string;
}

interface PullRequestWatchdogState {
  repairIssueNumber?: number;
  repairIssueOwner?: string;
  repairIssueRepo?: string;
  lastCommentedAt?: string;
}

interface WatchdogState {
  updatedAt: string;
  serviceCooldownUntil?: string;
  lastServiceFailureClass?: FailureClass;
  lastServiceActionAt?: string;
  deadlock?: {
    firstObservedAt?: string;
    lastAutoHealAt?: string;
    lastRepresentativeIssue?: number;
    lastEscalatedAt?: string;
  };
  issues: Record<string, IssueWatchdogState>;
  pullRequests?: Record<string, PullRequestWatchdogState>;
}

interface ServiceStatus {
  activeState: string;
  subState: string;
  result: string;
  execMainPid: number;
  restarts: number;
}

class Watchdog {
  private readonly reactorConfig = loadReactorConfig();
  private readonly engineConfig = loadReactorConfig(this.reactorConfig.engineRoot);
  private readonly config = loadWatchdogConfig(this.reactorConfig.repoRoot);
  private readonly github = new GitHubClient(this.reactorConfig);
  private readonly engineGithub = new GitHubClient(this.engineConfig);
  private stopped = false;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private stopSignal = createStopSignal();

  async start(once: boolean): Promise<void> {
    await fs.mkdir(this.config.stateDir, { recursive: true });

    await this.tick();
    if (once) {
      return;
    }

    while (!this.stopped) {
      await this.waitForNextTick();
      if (this.stopped) {
        break;
      }
      await this.tick();
    }
  }

  stop(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    this.stopSignal.resolve();
  }

  private async waitForNextTick(): Promise<void> {
    await Promise.race([
      this.stopSignal.promise,
      new Promise<void>((resolve) => {
        this.stopTimer = setTimeout(() => {
          this.stopTimer = null;
          resolve();
        }, this.config.pollIntervalMs);
      })
    ]);
  }

  private async tick(): Promise<void> {
    const state = await this.readState();
    const now = new Date();
    const serviceStatus = this.readServiceStatus(this.config.reactorServiceName);
    const recentLogs = this.readRecentServiceLogs(this.config.reactorServiceName);
    const serviceFailure = classifyFailure(
      `${serviceStatus.activeState} ${serviceStatus.subState} ${serviceStatus.result}\n${recentLogs}`
    );
    const currentHead = this.currentHead();

    await this.handleServiceHealth(state, serviceStatus, serviceFailure, now);

    const issues = await this.github.listOpenIssues();
    for (const issue of issues.filter((item) => !item.pull_request)) {
      await this.inspectIssue(issue, state, serviceStatus, serviceFailure, currentHead, now);
    }
    await this.inspectDeadlock(issues.filter((item) => !item.pull_request), state, serviceStatus, now);
    await this.inspectUnmanagedCorePullRequests(state, now);

    state.updatedAt = now.toISOString();
    await this.writeState(state);
  }

  private async inspectIssue(
    issue: GitHubIssue,
    state: WatchdogState,
    serviceStatus: ServiceStatus,
    serviceFailure: FailureInfo,
    currentHead: string,
    now: Date
  ): Promise<void> {
    const labels = labelNames(issue);
    if (!labels.has(this.reactorConfig.runningLabel) && !labels.has(this.reactorConfig.pausedLabel)) {
      return;
    }

    const issueState = this.issueState(state, issue.number);
    const record = await readRunRecord(issueRuntimePaths(this.reactorConfig, issue.number));

    if (labels.has(this.reactorConfig.runningLabel)) {
      await this.handleRunningIssue(issue, issueState, record, serviceStatus, state, now);
    }

    if (!labels.has(this.reactorConfig.pausedLabel)) {
      return;
    }

    const failure = classifyFailure(record?.lastError ?? "");
    issueState.lastFailureClass = failure.className;
    issueState.lastSeenHead ??= currentHead;

    if (issueState.repairIssueNumber) {
      const deployed = await this.reconcileRepairIssue(issue, issueState, state, now);
      if (deployed) {
        return;
      }
    }

    const pausedAt = parseDate(record?.updatedAt) ?? parseDate(issue.updated_at) ?? now;
    const pausedForMs = now.getTime() - pausedAt.getTime();
    const codeChangedSincePause = issueState.lastSeenHead !== currentHead;

    if (this.shouldAutoHealPausedIssue(issueState, failure, pausedForMs, codeChangedSincePause)) {
      if (!isServiceActive(serviceStatus) && serviceFailure.retryable) {
        await this.restartService(state, this.config.reactorServiceName, "paused issue requires a healthy reactor before retry");
      }

      await this.github.removeLabel(issue.number, this.reactorConfig.pausedLabel);
      await this.github.removeLabel(issue.number, this.reactorConfig.runningLabel);
      issueState.autoHealAttempts += 1;
      issueState.lastAutoHealAt = now.toISOString();
      issueState.lastSeenHead = currentHead;
      await this.upsertWatchdogComment(
        issue.number,
        [
          "OpenReactor watchdog cleared the pause on this issue so the reactor can try it again.",
          "",
          `Detected failure class: ${failure.className}.`,
          `Auto-heal attempt: ${issueState.autoHealAttempts}/${this.config.maxAutoHealAttemptsPerIssue}.`,
          codeChangedSincePause
            ? "The local OpenReactor code changed since this issue was paused, so the watchdog is giving it another chance."
            : "The watchdog judged this failure class as retryable and released the issue back into the queue."
        ].join("\n")
      );
      return;
    }

    if (failure.requiresCodeChange && !issueState.repairIssueNumber) {
      const repairIssueNumber = await this.ensureRepairIssue(issue, record, failure, issueState, now);
      if (repairIssueNumber) {
        issueState.repairIssueNumber = repairIssueNumber;
        const deployed = await this.reconcileRepairIssue(issue, issueState, state, now);
        if (deployed) {
          return;
        }
      }
    }

    if (pausedForMs < this.config.pausedEscalationMs) {
      return;
    }

    const shouldEscalate =
      !issueState.lastEscalatedAt ||
      now.getTime() - Date.parse(issueState.lastEscalatedAt) >= this.config.pausedEscalationMs;
    if (!shouldEscalate) {
      return;
    }

    issueState.lastEscalatedAt = now.toISOString();
    await this.upsertWatchdogComment(
      issue.number,
      [
        "OpenReactor watchdog flagged this issue for maintainer attention.",
        "",
        `Failure class: ${failure.className}.`,
        `Paused for: ${formatDuration(pausedForMs)}.`,
        `Auto-heal attempts used: ${issueState.autoHealAttempts}/${this.config.maxAutoHealAttemptsPerIssue}.`,
        issueState.repairIssueNumber
          ? `OpenReactor repair issue: #${issueState.repairIssueNumber}.`
          : null,
        failure.requiresCodeChange
          ? "This looks like an OpenReactor-core problem. The watchdog opened or is waiting on an internal repair issue, but it still needs maintainer attention because the problem has not resolved cleanly."
          : "The watchdog could not safely recover this issue automatically and is leaving it paused until a maintainer intervenes."
      ].filter(Boolean).join("\n")
    );
  }

  private async handleRunningIssue(
    issue: GitHubIssue,
    issueState: IssueWatchdogState,
    record: RunRecord | null,
    serviceStatus: ServiceStatus,
    state: WatchdogState,
    now: Date
  ): Promise<void> {
    if (!record) {
      const claimUpdatedAt = parseDate(issue.updated_at) ?? parseDate(issue.created_at) ?? now;
      const claimedForMs = now.getTime() - claimUpdatedAt.getTime();
      if (claimedForMs < this.config.runningClaimGraceMs) {
        return;
      }

      await this.github.removeLabel(issue.number, this.reactorConfig.runningLabel);
      await this.upsertWatchdogComment(
        issue.number,
        [
          "OpenReactor watchdog cleared a stale running claim for this issue.",
          "",
          `The issue still had the running label after ${formatDuration(claimedForMs)}, but no local run record existed anymore. The watchdog removed the stale claim so the reactor can reclaim it cleanly.`
        ].join("\n")
      );
      return;
    }

    if (record.iteration > this.config.maxRunningIterationsBeforeReset) {
      await this.handleRunawayIterations(issue, issueState, record, serviceStatus, state, now);
      return;
    }

    const heartbeatAt = parseDate(record.lastHeartbeatAt) ?? parseDate(record.updatedAt) ?? now;
    const stalledForMs = now.getTime() - heartbeatAt.getTime();
    if (stalledForMs < this.config.runningStallMs) {
      return;
    }

    if (isServiceActive(serviceStatus)) {
      await this.restartService(
        state,
        this.config.reactorServiceName,
        `issue #${issue.number} heartbeat stalled for ${formatDuration(stalledForMs)}`
      );
      issueState.lastAutoHealAt = now.toISOString();
      await this.upsertWatchdogComment(
        issue.number,
        [
          "OpenReactor watchdog detected a stalled running issue and restarted the reactor service.",
          "",
          `No heartbeat update was seen for ${formatDuration(stalledForMs)}.`,
          "The reactor should resume or re-claim the issue on startup."
        ].join("\n")
      );
    }
  }

  private async handleRunawayIterations(
    issue: GitHubIssue,
    issueState: IssueWatchdogState,
    record: RunRecord,
    serviceStatus: ServiceStatus,
    state: WatchdogState,
    now: Date
  ): Promise<void> {
    const threshold = this.config.maxRunningIterationsBeforeReset;
    const openPullRequest = await this.github.findPullRequestByBranch(record.branchName, "open");
    issueState.lastFailureClass = "runaway_iterations";

    if (!issueState.repairIssueNumber) {
      const repairIssueNumber = await this.ensureRepairIssue(
        issue,
        record,
        {
          className: "runaway_iterations",
          retryable: false,
          global: false,
          requiresCodeChange: true
        },
        issueState,
        now
      );
      if (repairIssueNumber) {
        issueState.repairIssueNumber = repairIssueNumber;
      }
    }

    await this.github.addLabels(issue.number, [this.reactorConfig.pausedLabel]);
    await this.github.removeLabel(issue.number, this.reactorConfig.runningLabel);
    issueState.autoHealAttempts += 1;
    issueState.lastAutoHealAt = now.toISOString();

    await this.upsertWatchdogComment(
      issue.number,
      [
        "OpenReactor watchdog detected a runaway retry loop and escalated it into OpenReactor repair work.",
        "",
        `Observed iteration: ${record.iteration}.`,
        `Threshold: ${threshold}.`,
        `Auto-heal attempt: ${issueState.autoHealAttempts}/${this.config.maxAutoHealAttemptsPerIssue}.`,
        issueState.repairIssueNumber
          ? `Repair issue: #${issueState.repairIssueNumber}.`
          : null,
        openPullRequest
          ? `An open PR already exists (${openPullRequest.html_url}), so the watchdog preserved the reviewable work while pausing the source issue.`
          : "No open PR exists yet, so the source issue was paused while OpenReactor fixes the underlying workflow problem."
      ].filter(Boolean).join("\n")
    );

    if (isServiceActive(serviceStatus)) {
      await this.restartService(
        state,
        this.config.reactorServiceName,
        `issue #${issue.number} exceeded safe iteration threshold (${record.iteration} > ${threshold}); pausing source issue and starting repair flow`
      );
    }
  }

  private async handleServiceHealth(
    state: WatchdogState,
    serviceStatus: ServiceStatus,
    failure: FailureInfo,
    now: Date
  ): Promise<void> {
    const cooldownUntil = parseDate(state.serviceCooldownUntil);

    if (cooldownUntil && cooldownUntil.getTime() > now.getTime()) {
      if (isServiceActive(serviceStatus)) {
        this.stopService(this.config.reactorServiceName, "watchdog cooldown is active");
        state.lastServiceActionAt = now.toISOString();
      }
      return;
    }

    if (cooldownUntil && cooldownUntil.getTime() <= now.getTime()) {
      state.serviceCooldownUntil = undefined;
      this.startService(this.config.reactorServiceName, "watchdog cooldown expired");
      state.lastServiceActionAt = now.toISOString();
      return;
    }

    if (isServiceActive(serviceStatus)) {
      return;
    }

    state.lastServiceFailureClass = failure.className;

    if (failure.className === "rate_limit") {
      this.stopService(this.config.reactorServiceName, "GitHub App rate limit detected");
      state.serviceCooldownUntil = new Date(
        now.getTime() + this.config.serviceCooldownMs
      ).toISOString();
      state.lastServiceActionAt = now.toISOString();
      return;
    }

    if (failure.retryable) {
      await this.restartService(
        state,
        this.config.reactorServiceName,
        `reactor service unhealthy (${failure.className})`
      );
    }
  }

  private async inspectDeadlock(
    issues: GitHubIssue[],
    state: WatchdogState,
    serviceStatus: ServiceStatus,
    now: Date
  ): Promise<void> {
    const runningIssues = issues.filter((issue) =>
      labelNames(issue).has(this.reactorConfig.runningLabel)
    );
    if (runningIssues.length > 0) {
      state.deadlock = undefined;
      return;
    }

    const acceptedBacklog = await this.listAcceptedIdlePullRequests(issues);
    if (!acceptedBacklog.length) {
      state.deadlock = undefined;
      return;
    }

    state.deadlock ??= {};
    state.deadlock.firstObservedAt ??= now.toISOString();
    state.deadlock.lastRepresentativeIssue = acceptedBacklog[0]?.issue.number;

    const lastAutoHealAt = parseDate(state.deadlock.lastAutoHealAt);
    const canAutoHealAgain =
      !lastAutoHealAt ||
      now.getTime() - lastAutoHealAt.getTime() >= this.config.deadlockAutoHealCooldownMs;

    if (canAutoHealAgain) {
      const healed = await this.attemptDeadlockAutoHeal(acceptedBacklog, state, serviceStatus, now);
      if (healed) {
        state.deadlock.lastAutoHealAt = now.toISOString();
        return;
      }
    }

    const observedAt = parseDate(state.deadlock.firstObservedAt) ?? now;
    const deadlockedForMs = now.getTime() - observedAt.getTime();
    if (deadlockedForMs < this.config.deadlockEscalationMs) {
      return;
    }

    const representative = acceptedBacklog[0];
    if (!representative) {
      return;
    }

    const shouldEscalate =
      !state.deadlock.lastEscalatedAt ||
      now.getTime() - Date.parse(state.deadlock.lastEscalatedAt) >= this.config.deadlockEscalationMs;
    if (!shouldEscalate) {
      return;
    }

    state.deadlock.lastEscalatedAt = now.toISOString();
    const issueState = this.issueState(state, representative.issue.number);
    issueState.lastFailureClass = "workflow_deadlock";
    await this.ensureRepairIssue(
      representative.issue,
      await readRunRecord(issueRuntimePaths(this.reactorConfig, representative.issue.number)),
      {
        className: "workflow_deadlock",
        retryable: false,
        global: false,
        requiresCodeChange: true
      },
      issueState,
      now
    );
  }

  private async listAcceptedIdlePullRequests(
    issues: GitHubIssue[]
  ): Promise<Array<{ issue: GitHubIssue; pullRequest: GitHubPullRequest }>> {
    const backlog: Array<{ issue: GitHubIssue; pullRequest: GitHubPullRequest }> = [];

    for (const issue of issues) {
      const labels = labelNames(issue);
      if (
        !labels.has(this.reactorConfig.acceptedLabel) ||
        labels.has(this.reactorConfig.runningLabel) ||
        labels.has(this.reactorConfig.pausedLabel) ||
        labels.has(MAINTAINER_ACTION_REQUIRED_LABEL)
      ) {
        continue;
      }

      const branchName = issueRuntimePaths(this.reactorConfig, issue.number).branchName;
      const pullRequest = await this.github.findPullRequestByBranch(branchName, "open");
      if (!pullRequest) {
        continue;
      }

      backlog.push({
        issue,
        pullRequest: await this.github.getPullRequest(pullRequest.number)
      });
    }

    return backlog;
  }

  private async attemptDeadlockAutoHeal(
    backlog: Array<{ issue: GitHubIssue; pullRequest: GitHubPullRequest }>,
    state: WatchdogState,
    serviceStatus: ServiceStatus,
    now: Date
  ): Promise<boolean> {
    for (const item of backlog) {
      if (hasMergeConflict(item.pullRequest)) {
        if (isServiceActive(serviceStatus)) {
          await this.restartService(
            state,
            this.config.reactorServiceName,
            `accepted PR ${item.pullRequest.html_url} is conflicted and blocking the queue`
          );
        }
        await this.upsertWatchdogComment(
          item.issue.number,
          [
            "OpenReactor watchdog detected a deadlock caused by a conflicted accepted PR.",
            "",
            `Blocked PR: ${item.pullRequest.html_url}.`,
            "The watchdog restarted the reactor so it can reclaim the issue and repair the branch."
          ].join("\n")
        );
        return true;
      }

      if (await this.github.isPullRequestAutoMergeEnabled(item.pullRequest.number)) {
        continue;
      }

      if (!canDirectlyMergeAcceptedPullRequest(item.pullRequest)) {
        continue;
      }

      try {
        await this.github.mergePullRequest(item.pullRequest.number, "squash");
      } catch (error) {
        if (isExpectedDirectMergeWaitError(error)) {
          continue;
        }
        throw error;
      }

      await this.upsertWatchdogComment(
        item.issue.number,
        [
          "OpenReactor watchdog resolved a deadlock by merging a completed accepted PR.",
          "",
          `Merged PR: ${item.pullRequest.html_url}.`,
          "The queue can now continue on the downstream dependency chain."
        ].join("\n")
      );
      return true;
    }

    return false;
  }

  private shouldAutoHealPausedIssue(
    issueState: IssueWatchdogState,
    failure: FailureInfo,
    pausedForMs: number,
    codeChangedSincePause: boolean
  ): boolean {
    if (issueState.autoHealAttempts >= this.config.maxAutoHealAttemptsPerIssue) {
      return false;
    }

    if (pausedForMs < this.config.pausedRetryMs) {
      return false;
    }

    if (failure.className === "schema_mismatch") {
      return codeChangedSincePause;
    }

    return failure.retryable;
  }

  private async ensureRepairIssue(
    sourceIssue: GitHubIssue,
    record: RunRecord | null,
    failure: FailureInfo,
    issueState: IssueWatchdogState,
    now: Date
  ): Promise<number | null> {
    if (issueState.repairIssueNumber) {
      return issueState.repairIssueNumber;
    }

    const repairClient = this.repairGitHubClient();
    const repairRepo = this.repairRepoRef();
    const body = buildRepairIssueBody(
      this.engineConfig.owner,
      { owner: this.reactorConfig.owner, repo: this.reactorConfig.repo },
      repoIssueRef(this.reactorConfig.owner, this.reactorConfig.repo, sourceIssue.number),
      sourceIssue,
      record,
      failure
    );
    const title =
      `[OpenReactor Repair] Resolve ${failure.className} blocking ` +
      `${this.reactorConfig.owner}/${this.reactorConfig.repo}#${sourceIssue.number}`;
    const created = await repairClient.createIssue({
      title,
      body,
      labels: [OPENREACTOR_CORE_LABEL, this.engineConfig.maintainerSteeredLabel]
    });

    issueState.repairIssueNumber = created.number;
    issueState.repairIssueOwner = repairRepo.owner;
    issueState.repairIssueRepo = repairRepo.repo;
    issueState.repairIssueOpenedAt = now.toISOString();
    await this.github.createComment(
      sourceIssue.number,
      [
        `OpenReactor watchdog opened internal repair issue ${repairIssueRef(repairRepo.owner, repairRepo.repo, created.number)} to fix the OpenReactor fault blocking this request.`,
        "",
        `Repair issue: ${created.html_url}`,
        "Once that repair merges and the local services refresh, the watchdog will release this request back into the queue."
      ].join("\n")
    );
    await this.upsertWatchdogComment(
      sourceIssue.number,
      [
        "OpenReactor watchdog detected an OpenReactor-core fault and opened an internal repair issue.",
        "",
        `Failure class: ${failure.className}.`,
        `Repair issue: ${repairIssueRef(repairRepo.owner, repairRepo.repo, created.number)} ${created.html_url}.`,
        this.isManagingEngineRepo()
          ? "The reactor should work that repair issue like any other issue, then the watchdog will redeploy the local OpenReactor services after the repair PR merges."
          : "The watchdog opened this repair in the central OpenReactor engine repo. Once that repair merges, the watchdog will fast-forward the local engine checkout and restart this managed repo's OpenReactor services."
      ].join("\n")
    );

    return created.number;
  }

  private async reconcileRepairIssue(
    sourceIssue: GitHubIssue,
    issueState: IssueWatchdogState,
    state: WatchdogState,
    now: Date
  ): Promise<boolean> {
    const repairIssueNumber = issueState.repairIssueNumber;
    if (!repairIssueNumber) {
      return false;
    }

    const repairClient = await this.resolveRepairGitHubClient(issueState);
    const repairIssue = await repairClient.getIssue(repairIssueNumber);
    const repairBranch = issueRuntimePaths(this.engineConfig, repairIssueNumber).branchName;
    const pullRequest = await repairClient.findPullRequestByBranch(repairBranch, "all");
    const merged = pullRequest ? await repairClient.isPullRequestMerged(pullRequest.number) : false;

    if (merged) {
      const deployed = await this.applyMergedRepair(sourceIssue, repairIssue, pullRequest?.html_url ?? "", issueState, state, now);
      return deployed;
    }

    if (repairIssue.state === "closed") {
      await this.upsertWatchdogComment(
        sourceIssue.number,
        [
          "OpenReactor watchdog is waiting for maintainer intervention.",
          "",
          `Repair issue ${repairIssueRefForState(issueState, repairIssue.number)} closed without a merged PR, so the original paused issue cannot be released automatically.`,
          `Repair issue URL: ${repairIssue.html_url}`
        ].join("\n")
      );
    }

    return false;
  }

  private async applyMergedRepair(
    sourceIssue: GitHubIssue,
    repairIssue: GitHubIssue,
    repairPrUrl: string,
    issueState: IssueWatchdogState,
    state: WatchdogState,
    now: Date
  ): Promise<boolean> {
    if (issueState.repairDeployCompletedAt) {
      await this.github.removeLabel(sourceIssue.number, this.reactorConfig.pausedLabel);
      await this.github.removeLabel(sourceIssue.number, this.reactorConfig.runningLabel);
      return true;
    }

    const engineRepoRoot = this.engineConfig.repoRoot;
    const statusOutput = execFileSync(
      "git",
      ["-C", engineRepoRoot, "status", "--porcelain"],
      { encoding: "utf8" }
    ).trim();
    if (statusOutput) {
      await this.upsertWatchdogComment(
        sourceIssue.number,
        [
          "OpenReactor watchdog found a merged internal repair PR, but it cannot redeploy the local OpenReactor checkout automatically.",
          "",
          "Reason: the local OpenReactor engine repository has uncommitted changes.",
          `Repair issue: ${repairIssueRefForState(issueState, repairIssue.number)} ${repairIssue.html_url}`,
          repairPrUrl ? `Merged PR: ${repairPrUrl}` : null
        ].filter(Boolean).join("\n")
      );
      return false;
    }

    execFileSync("git", ["-C", engineRepoRoot, "fetch", "origin"], {
      stdio: "ignore"
    });
    const currentBranch = this.currentBranch(engineRepoRoot);
    if (currentBranch !== "main") {
      execFileSync("git", ["-C", engineRepoRoot, "checkout", "main"], {
        stdio: "ignore"
      });
    }
    execFileSync(
      "git",
      ["-C", engineRepoRoot, "pull", "--ff-only", "origin", "main"],
      { stdio: "ignore" }
    );

    issueState.repairIssueMergedAt = now.toISOString();
    issueState.repairDeployCompletedAt = now.toISOString();
    issueState.lastSeenHead = this.currentHead(this.reactorConfig.repoRoot);
    state.updatedAt = now.toISOString();
    await this.writeState(state);

    await this.github.removeLabel(sourceIssue.number, this.reactorConfig.pausedLabel);
    await this.github.removeLabel(sourceIssue.number, this.reactorConfig.runningLabel);
    await this.upsertWatchdogComment(
      sourceIssue.number,
      [
        "OpenReactor watchdog applied a merged OpenReactor repair and released this request back into the queue.",
        "",
        `Repair issue: ${repairIssueRefForState(issueState, repairIssue.number)} ${repairIssue.html_url}`,
        repairPrUrl ? `Merged PR: ${repairPrUrl}` : null,
        this.isManagingEngineRepo()
          ? "The watchdog fast-forwarded the local checkout to `origin/main` and restarted the local OpenReactor services."
          : "The watchdog fast-forwarded the local OpenReactor engine checkout to `origin/main` and restarted this managed repo's OpenReactor services."
      ].filter(Boolean).join("\n")
    );

    execFileSync(
      "systemctl",
      [
        "--user",
        "restart",
        this.config.reactorServiceName,
        this.config.watchdogServiceName
      ],
      { stdio: "ignore" }
    );

    return true;
  }

  private issueState(state: WatchdogState, issueNumber: number): IssueWatchdogState {
    const key = String(issueNumber);
    state.issues[key] ??= {
      autoHealAttempts: 0
    };
    return state.issues[key];
  }

  private pullRequestState(
    state: WatchdogState,
    pullRequestNumber: number
  ): PullRequestWatchdogState {
    const key = String(pullRequestNumber);
    state.pullRequests ??= {};
    state.pullRequests[key] ??= {};
    return state.pullRequests[key];
  }

  private async readState(): Promise<WatchdogState> {
    try {
      const raw = await fs.readFile(this.config.statePath, "utf8");
      return JSON.parse(raw) as WatchdogState;
    } catch {
      return {
        updatedAt: new Date(0).toISOString(),
        issues: {},
        pullRequests: {}
      };
    }
  }

  private async writeState(state: WatchdogState): Promise<void> {
    await fs.mkdir(this.config.stateDir, { recursive: true });
    await fs.writeFile(this.config.statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  private async resetIssueRuntime(
    issueNumber: number,
    branchName: string,
    now: Date
  ): Promise<void> {
    const paths = issueRuntimePaths(this.reactorConfig, issueNumber);
    const archiveRoot = path.join(
      this.reactorConfig.repoRoot,
      ".openreactor",
      "archive",
      `watchdog-runaway-issue-${issueNumber}-${timestampForPath(now)}`
    );

    await fs.mkdir(archiveRoot, { recursive: true });

    if (this.reactorConfig.workspacePolicy.teardownCommand) {
      await appendRunActivity(paths.runDir, {
        issueNumber,
        kind: "workspace",
        title: "Tearing down workspace",
        message: "Watchdog is running the workspace teardown command before resetting this issue runtime.",
        data: {
          command: this.reactorConfig.workspacePolicy.teardownCommand
        }
      });

      try {
        const result = await runWorkspacePolicyCommand({
          command: this.reactorConfig.workspacePolicy.teardownCommand,
          cwd: paths.worktreePath,
          env: this.reactorConfig.workspacePolicy.env,
          phase: "teardown",
          policyPath: this.reactorConfig.workspacePolicyPath,
          issueNumber,
          branchName,
          runDir: paths.runDir
        });

        await appendRunActivity(paths.runDir, {
          issueNumber,
          kind: "workspace",
          title: "Workspace teardown finished",
          message: "Teardown command completed successfully.",
          data: {
            stdout: result.stdout.trim().slice(0, 400),
            stderr: result.stderr.trim().slice(0, 400)
          }
        });
      } catch (error) {
        await appendRunActivity(paths.runDir, {
          issueNumber,
          kind: "workspace",
          level: "warn",
          title: "Workspace teardown failed",
          message: error instanceof Error ? error.message : "Teardown command failed during watchdog reset."
        });
      }
    }

    try {
      await fs.rename(paths.runDir, path.join(archiveRoot, "run"));
    } catch {
      // Ignore missing run directory.
    }

    try {
      execFileSync(
        "git",
        ["-C", this.reactorConfig.repoRoot, "worktree", "remove", "--force", paths.worktreePath],
        { stdio: "ignore" }
      );
    } catch {
      // Ignore missing worktree.
    }

    try {
      execFileSync("git", ["-C", this.reactorConfig.repoRoot, "worktree", "prune"], {
        stdio: "ignore"
      });
    } catch {
      // Ignore prune failures.
    }

    try {
      execFileSync("git", ["-C", this.reactorConfig.repoRoot, "branch", "-D", branchName], {
        stdio: "ignore"
      });
    } catch {
      // Ignore missing branch.
    }
  }

  private currentHead(repoRoot = this.reactorConfig.repoRoot): string {
    return execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
      encoding: "utf8"
    }).trim();
  }

  private isManagingEngineRepo(): boolean {
    return path.resolve(this.reactorConfig.engineRoot) === path.resolve(this.reactorConfig.repoRoot);
  }

  private currentBranch(repoRoot = this.engineConfig.repoRoot): string {
    return execFileSync(
      "git",
      ["-C", repoRoot, "rev-parse", "--abbrev-ref", "HEAD"],
      { encoding: "utf8" }
    ).trim();
  }

  private repairGitHubClient(): GitHubClient {
    return this.isManagingEngineRepo() ? this.github : this.engineGithub;
  }

  private repairRepoRef(): { owner: string; repo: string } {
    return this.isManagingEngineRepo()
      ? { owner: this.reactorConfig.owner, repo: this.reactorConfig.repo }
      : { owner: this.engineConfig.owner, repo: this.engineConfig.repo };
  }

  private async resolveRepairGitHubClient(issueState: IssueWatchdogState): Promise<GitHubClient> {
    if (!issueState.repairIssueOwner || !issueState.repairIssueRepo) {
      return this.repairGitHubClient();
    }

    if (
      issueState.repairIssueOwner === this.reactorConfig.owner &&
      issueState.repairIssueRepo === this.reactorConfig.repo
    ) {
      return this.github;
    }

    return this.engineGithub;
  }

  private readServiceStatus(serviceName: string): ServiceStatus {
    const raw = execFileSync(
      "systemctl",
      [
        "--user",
        "show",
        serviceName,
        "--property=ActiveState,SubState,Result,ExecMainPID,NRestarts",
        "--no-pager"
      ],
      { encoding: "utf8" }
    );

    const values = new Map<string, string>();
    for (const line of raw.split(/\r?\n/)) {
      const separator = line.indexOf("=");
      if (separator <= 0) {
        continue;
      }
      values.set(line.slice(0, separator), line.slice(separator + 1));
    }

    return {
      activeState: values.get("ActiveState") ?? "unknown",
      subState: values.get("SubState") ?? "unknown",
      result: values.get("Result") ?? "unknown",
      execMainPid: Number.parseInt(values.get("ExecMainPID") ?? "0", 10) || 0,
      restarts: Number.parseInt(values.get("NRestarts") ?? "0", 10) || 0
    };
  }

  private readRecentServiceLogs(serviceName: string): string {
    try {
      return execFileSync("journalctl", ["--user", "-u", serviceName, "-n", "80", "--no-pager"], {
        encoding: "utf8"
      });
    } catch {
      return "";
    }
  }

  private async restartService(
    state: WatchdogState | undefined,
    serviceName: string,
    reason: string
  ): Promise<void> {
    execFileSync("systemctl", ["--user", "restart", serviceName], {
      stdio: "ignore"
    });
    if (state) {
      state.lastServiceActionAt = new Date().toISOString();
    }
    console.log(`Watchdog restarted ${serviceName}: ${reason}`);
  }

  private stopService(serviceName: string, reason: string): void {
    execFileSync("systemctl", ["--user", "stop", serviceName], {
      stdio: "ignore"
    });
    console.log(`Watchdog stopped ${serviceName}: ${reason}`);
  }

  private startService(serviceName: string, reason: string): void {
    execFileSync("systemctl", ["--user", "start", serviceName], {
      stdio: "ignore"
    });
    console.log(`Watchdog started ${serviceName}: ${reason}`);
  }

  private async upsertWatchdogComment(issueNumber: number, body: string): Promise<void> {
    const fullBody = `${WATCHDOG_COMMENT_MARKER}\n\n${body}`;
    const comments = await this.github.listIssueComments(issueNumber);
    const existing = comments.find((comment) => comment.body.includes(WATCHDOG_COMMENT_MARKER));
    if (existing?.body === fullBody) {
      return;
    }
    if (existing) {
      await this.github.updateComment(existing.id, fullBody);
      return;
    }
    await this.github.createComment(issueNumber, fullBody);
  }

  private async inspectUnmanagedCorePullRequests(
    state: WatchdogState,
    now: Date
  ): Promise<void> {
    if (!this.isManagingEngineRepo()) {
      return;
    }

    const pullRequests = await this.github.listOpenPullRequests();
    for (const pullRequest of pullRequests) {
      const branchName = (pullRequest.head?.ref ?? "").trim();
      if (!isMaintainerCoreBranch(branchName)) {
        continue;
      }

      if (parseIssueNumberFromBranch(this.reactorConfig.branchPrefix, branchName) !== null) {
        continue;
      }

      const fullPullRequest = await this.github.getPullRequest(pullRequest.number);
      if (!hasMergeConflict(fullPullRequest)) {
        continue;
      }

      const prState = this.pullRequestState(state, pullRequest.number);
      const repairIssueNumber = await this.ensurePullRequestRepairIssue(fullPullRequest, prState, now);
      if (!repairIssueNumber) {
        continue;
      }

      await this.upsertWatchdogComment(
        pullRequest.number,
        [
          "OpenReactor watchdog detected a conflicted maintainer core PR that is outside the normal issue-loop repair path.",
          "",
          `Repair issue: ${repairIssueRefForPullRequestState(prState, repairIssueNumber)}.`,
          "OpenReactor will resolve the workflow defect through that repair issue instead of silently leaving this PR conflicted."
        ].join("\n")
      );
      prState.lastCommentedAt = now.toISOString();
    }
  }

  private async ensurePullRequestRepairIssue(
    pullRequest: GitHubPullRequest,
    pullRequestState: PullRequestWatchdogState,
    now: Date
  ): Promise<number | null> {
    if (pullRequestState.repairIssueNumber) {
      return pullRequestState.repairIssueNumber;
    }

    const repairRepo = this.repairRepoRef();
    const created = await this.repairGitHubClient().createIssue({
      title: `[OpenReactor Repair] Reconcile conflicted core PR #${pullRequest.number}`,
      body: buildPullRequestRepairIssueBody(repairRepo, pullRequest),
      labels: [OPENREACTOR_CORE_LABEL, this.engineConfig.maintainerSteeredLabel]
    });

    pullRequestState.repairIssueNumber = created.number;
    pullRequestState.repairIssueOwner = repairRepo.owner;
    pullRequestState.repairIssueRepo = repairRepo.repo;
    pullRequestState.lastCommentedAt = now.toISOString();
    return created.number;
  }
}

function classifyFailure(message: string): FailureInfo {
  const normalized = message.toLowerCase();
  if (!normalized.trim()) {
    return {
      className: "none",
      retryable: false,
      global: false,
      requiresCodeChange: false
    };
  }

  if (normalized.includes("api rate limit exceeded")) {
    return {
      className: "rate_limit",
      retryable: true,
      global: true,
      requiresCodeChange: false
    };
  }

  if (
    normalized.includes("bad credentials") ||
    normalized.includes("missing required environment variable") ||
    normalized.includes("401 unauthorized")
  ) {
    return {
      className: "auth",
      retryable: false,
      global: true,
      requiresCodeChange: false
    };
  }

  if (
    normalized.includes("both ai providers appear unavailable") ||
    Boolean(detectProviderOutage("codex", normalized)) ||
    Boolean(detectProviderOutage("claude", normalized))
  ) {
    return {
      className: "provider_unavailable",
      retryable: true,
      global: false,
      requiresCodeChange: false
    };
  }

  if (
    normalized.includes("422 unprocessable entity") ||
    normalized.includes("no subschema in \"anyof\" matched") ||
    normalized.includes("invalid request")
  ) {
    return {
      className: "schema_mismatch",
      retryable: false,
      global: false,
      requiresCodeChange: true
    };
  }

  if (
    normalized.includes("executable not found in $path") ||
    normalized.includes("enoent") ||
    normalized.includes("command not found")
  ) {
    return {
      className: "missing_binary",
      retryable: false,
      global: false,
      requiresCodeChange: true
    };
  }

  if (
    normalized.includes("403 forbidden") ||
    normalized.includes("502 bad gateway") ||
    normalized.includes("503 service unavailable")
  ) {
    return {
      className: "github_api",
      retryable: true,
      global: true,
      requiresCodeChange: false
    };
  }

  if (
    normalized.includes("failed") ||
    normalized.includes("inactive") ||
    normalized.includes("restart counter")
  ) {
    return {
      className: "service_unhealthy",
      retryable: true,
      global: true,
      requiresCodeChange: false
    };
  }

  return {
    className: "unknown",
    retryable: false,
    global: false,
    requiresCodeChange: false
  };
}

function buildRepairIssueBody(
  owner: string,
  sourceRepo: { owner: string; repo: string },
  sourceIssueRef: string,
  sourceIssue: GitHubIssue,
  record: RunRecord | null,
  failure: FailureInfo
): string {
  return [
    "<!-- openreactor:feature-request -->",
    REPAIR_REQUEST_MARKER,
    "",
    "## Summary",
    `Repair OpenReactor so ${sourceIssueRef} can proceed again`,
    "",
    "## Problem",
    `The OpenReactor watchdog detected a concrete OpenReactor-core failure while processing ${sourceIssueRef}.`,
    "",
    `Source issue: ${sourceIssueRef} ${sourceIssue.html_url}`,
    `Source managed repo: ${sourceRepo.owner}/${sourceRepo.repo}`,
    `Failure class: ${failure.className}`,
    record ? `Observed iteration: ${record.iteration}` : null,
    record?.branchName ? `Source branch: ${record.branchName}` : null,
    record?.lastError ? `Failure detail: ${record.lastError}` : "Failure detail: _Unavailable_",
    "",
    "## Desired Outcome",
    "Fix the OpenReactor bug, configuration path, or workflow defect so the blocked source issue can be retried successfully.",
    "",
    "Requested change:",
    `Repair the OpenReactor workflow so it no longer hits the detected ${failure.className} failure and can resume ${sourceIssueRef}.`,
    "",
    "## Desired Scope",
    "Auto — Let the issue agent decide the amount of scope.",
    "",
    "## Constraints",
    "- Treat this as maintainer-controlled OpenReactor work.",
    "- Preserve the ability for OpenReactor to supervise product work safely.",
    "- Update workflow docs or prompts if the repair changes durable OpenReactor behavior.",
    "- Investigate the live GitHub state, local run artifacts, and current engine code before choosing the fix.",
    "",
    "## Success Criteria",
    `- The underlying OpenReactor failure that blocked ${sourceIssueRef} is fixed.`,
    "- A PR is opened and merged for the repair.",
    "- The watchdog can fast-forward the local OpenReactor checkout and restart the affected services.",
    `- After the repair deploys locally, ${sourceIssueRef} becomes eligible for the reactor again.`,
    "",
    "## Additional Notes",
    "- This issue was generated automatically by the local OpenReactor watchdog.",
    "- It is a concrete repair task, not a speculative proposal.",
    "",
    "## Submitted By",
    "OpenReactor Watchdog",
    "",
    "## GitHub Username",
    `@${owner}`,
    "",
    "## Contact",
    "_Not provided_",
    "",
    "## Intake Metadata",
    `- Origin: local watchdog`,
    `- Source issue: ${sourceIssueRef}`,
    `- Source repo: ${sourceRepo.owner}/${sourceRepo.repo}`,
    `- Failure class: ${failure.className}`,
    `- Generated at: ${new Date().toISOString()}`
  ].join("\n");
}

function buildPullRequestRepairIssueBody(
  repairRepo: { owner: string; repo: string },
  pullRequest: GitHubPullRequest
): string {
  const prRef = repoPullRequestRef(repairRepo.owner, repairRepo.repo, pullRequest.number);
  return [
    "<!-- openreactor:feature-request -->",
    REPAIR_REQUEST_MARKER,
    "",
    "## Summary",
    `Reconcile conflicted maintainer core PR ${prRef}`,
    "",
    "## Problem",
    `A maintainer-authored OpenReactor core PR is conflicted and sits outside the normal issue-loop repair path.`,
    "",
    `Source PR: ${prRef} ${pullRequest.html_url}`,
    `Source branch: ${(pullRequest.head?.ref ?? "").trim() || "_unknown_"}`,
    `Merge state: ${pullRequest.mergeable_state ?? "_unknown_"}`,
    "",
    "## Desired Outcome",
    "Preserve the underlying OpenReactor fix while making the main branch mergeable again.",
    "",
    "## Constraints",
    "- Treat this as maintainer-controlled OpenReactor work.",
    "- Review the current engine code, the source PR diff, and the live GitHub state before deciding how to proceed.",
    "- You may update shared workflow docs if the fix changes durable OpenReactor behavior.",
    "- If keeping the original PR is not the best path, it is acceptable to supersede it with a new issue-loop PR as long as the old PR is clearly linked and closed out.",
    "",
    "## Success Criteria",
    `- The underlying change from ${prRef} is no longer stranded in a conflicted PR.`,
    "- A clear repair PR is opened and merged.",
    "- The resulting workflow for maintainer core PRs is more resilient than before.",
    "",
    "## Intake Metadata",
    "- Origin: local watchdog",
    `- Source PR: ${prRef}`,
    `- Generated at: ${new Date().toISOString()}`
  ].join("\n");
}

function repoIssueRef(owner: string, repo: string, issueNumber: number): string {
  return `${owner}/${repo}#${issueNumber}`;
}

function repoPullRequestRef(owner: string, repo: string, pullRequestNumber: number): string {
  return `${owner}/${repo}#${pullRequestNumber}`;
}

function repairIssueRef(owner: string, repo: string, issueNumber: number): string {
  return repoIssueRef(owner, repo, issueNumber);
}

function repairIssueRefForState(issueState: IssueWatchdogState, issueNumber: number): string {
  const owner = issueState.repairIssueOwner?.trim() || "";
  const repo = issueState.repairIssueRepo?.trim() || "";
  if (owner && repo) {
    return repairIssueRef(owner, repo, issueNumber);
  }
  return `#${issueNumber}`;
}

function repairIssueRefForPullRequestState(
  pullRequestState: PullRequestWatchdogState,
  issueNumber: number
): string {
  const owner = pullRequestState.repairIssueOwner?.trim() || "";
  const repo = pullRequestState.repairIssueRepo?.trim() || "";
  if (owner && repo) {
    return repairIssueRef(owner, repo, issueNumber);
  }
  return `#${issueNumber}`;
}

function parseIssueNumberFromBranch(branchPrefix: string, branchName: string): number | null {
  const trimmedBranch = branchName.trim();
  if (!trimmedBranch.startsWith(branchPrefix)) {
    return null;
  }

  const suffix = trimmedBranch.slice(branchPrefix.length);
  if (!/^\d+$/.test(suffix)) {
    return null;
  }

  const issueNumber = Number.parseInt(suffix, 10);
  return Number.isFinite(issueNumber) && issueNumber > 0 ? issueNumber : null;
}

function isMaintainerCoreBranch(branchName: string): boolean {
  return branchName.trim().startsWith("openreactor/pr-");
}

function isServiceActive(status: ServiceStatus): boolean {
  return status.activeState === "active" && status.execMainPid > 0;
}

function parseDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return new Date(timestamp);
}

function formatDuration(durationMs: number): string {
  const totalMinutes = Math.max(1, Math.round(durationMs / 60_000));
  if (totalMinutes < 60) {
    return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${hours}h ${minutes}m`;
}

function timestampForPath(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function labelNames(issue: GitHubIssue): Set<string> {
  return new Set(issue.labels.map((label) => label.name).filter(Boolean) as string[]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createStopSignal(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolved = false;
  let resolvePromise = () => {};
  const promise = new Promise<void>((resolve) => {
    resolvePromise = () => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolve();
    };
  });

  return {
    promise,
    resolve: resolvePromise
  };
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const watchdog = new Watchdog();
  let stopping = false;

  const stop = () => {
    if (stopping) {
      return;
    }
    stopping = true;
    watchdog.stop();
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  await watchdog.start(once);
}

main().catch((error) => {
  console.error("OpenReactor watchdog failed.", error);
  process.exitCode = 1;
});
