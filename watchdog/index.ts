import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { loadConfig as loadReactorConfig } from "../reactor/config";
import { GitHubClient, type GitHubIssue } from "../reactor/github";
import { issueRuntimePaths, readRunRecord, type RunRecord } from "../reactor/runner";
import { loadWatchdogConfig, type WatchdogConfig } from "./config";

const WATCHDOG_COMMENT_MARKER = "<!-- openreactor:watchdog -->";

type FailureClass =
  | "none"
  | "rate_limit"
  | "auth"
  | "schema_mismatch"
  | "missing_binary"
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
}

interface WatchdogState {
  updatedAt: string;
  serviceCooldownUntil?: string;
  lastServiceFailureClass?: FailureClass;
  lastServiceActionAt?: string;
  issues: Record<string, IssueWatchdogState>;
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
  private readonly config = loadWatchdogConfig(this.reactorConfig.repoRoot);
  private readonly github = new GitHubClient(this.reactorConfig);
  private stopped = false;

  async start(once: boolean): Promise<void> {
    await fs.mkdir(this.config.stateDir, { recursive: true });

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
  }

  private async tick(): Promise<void> {
    const state = await this.readState();
    const now = new Date();
    const serviceStatus = this.readServiceStatus();
    const recentLogs = this.readRecentServiceLogs();
    const serviceFailure = classifyFailure(
      `${serviceStatus.activeState} ${serviceStatus.subState} ${serviceStatus.result}\n${recentLogs}`
    );
    const currentHead = this.currentHead();

    await this.handleServiceHealth(state, serviceStatus, serviceFailure, now);

    const issues = await this.github.listOpenIssues();
    for (const issue of issues.filter((item) => !item.pull_request)) {
      await this.inspectIssue(issue, state, serviceStatus, serviceFailure, currentHead, now);
    }

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
      await this.handleRunningIssue(issue, issueState, record, serviceStatus, now);
    }

    if (!labels.has(this.reactorConfig.pausedLabel)) {
      return;
    }

    const failure = classifyFailure(record?.lastError ?? "");
    issueState.lastFailureClass = failure.className;
    issueState.lastSeenHead ??= currentHead;

    const pausedAt = parseDate(record?.updatedAt) ?? parseDate(issue.updated_at) ?? now;
    const pausedForMs = now.getTime() - pausedAt.getTime();
    const codeChangedSincePause = issueState.lastSeenHead !== currentHead;

    if (this.shouldAutoHealPausedIssue(issueState, failure, pausedForMs, codeChangedSincePause)) {
      if (!isServiceActive(serviceStatus) && serviceFailure.retryable) {
        await this.restartService(state, "paused issue requires a healthy reactor before retry");
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
        failure.requiresCodeChange
          ? "This looks like a code or schema problem inside OpenReactor itself, so the watchdog is waiting for a maintainer fix before retrying."
          : "The watchdog could not safely recover this issue automatically and is leaving it paused until a maintainer intervenes."
      ].join("\n")
    );
  }

  private async handleRunningIssue(
    issue: GitHubIssue,
    issueState: IssueWatchdogState,
    record: RunRecord | null,
    serviceStatus: ServiceStatus,
    now: Date
  ): Promise<void> {
    if (!record) {
      await this.github.removeLabel(issue.number, this.reactorConfig.runningLabel);
      await this.upsertWatchdogComment(
        issue.number,
        [
          "OpenReactor watchdog cleared a stale running claim for this issue.",
          "",
          "The issue still had the running label, but no local run record existed anymore. The watchdog removed the stale claim so the reactor can reclaim it cleanly."
        ].join("\n")
      );
      return;
    }

    const heartbeatAt = parseDate(record.lastHeartbeatAt) ?? parseDate(record.updatedAt) ?? now;
    const stalledForMs = now.getTime() - heartbeatAt.getTime();
    if (stalledForMs < this.config.runningStallMs) {
      return;
    }

    if (isServiceActive(serviceStatus)) {
      await this.restartService(
        undefined,
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

  private async handleServiceHealth(
    state: WatchdogState,
    serviceStatus: ServiceStatus,
    failure: FailureInfo,
    now: Date
  ): Promise<void> {
    const cooldownUntil = parseDate(state.serviceCooldownUntil);

    if (cooldownUntil && cooldownUntil.getTime() > now.getTime()) {
      if (isServiceActive(serviceStatus)) {
        this.stopService("watchdog cooldown is active");
        state.lastServiceActionAt = now.toISOString();
      }
      return;
    }

    if (cooldownUntil && cooldownUntil.getTime() <= now.getTime()) {
      state.serviceCooldownUntil = undefined;
      this.startService("watchdog cooldown expired");
      state.lastServiceActionAt = now.toISOString();
      return;
    }

    if (isServiceActive(serviceStatus)) {
      return;
    }

    state.lastServiceFailureClass = failure.className;

    if (failure.className === "rate_limit") {
      this.stopService("GitHub App rate limit detected");
      state.serviceCooldownUntil = new Date(
        now.getTime() + this.config.serviceCooldownMs
      ).toISOString();
      state.lastServiceActionAt = now.toISOString();
      return;
    }

    if (failure.retryable) {
      await this.restartService(state, `reactor service unhealthy (${failure.className})`);
    }
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

  private issueState(state: WatchdogState, issueNumber: number): IssueWatchdogState {
    const key = String(issueNumber);
    state.issues[key] ??= {
      autoHealAttempts: 0
    };
    return state.issues[key];
  }

  private async readState(): Promise<WatchdogState> {
    try {
      const raw = await fs.readFile(this.config.statePath, "utf8");
      return JSON.parse(raw) as WatchdogState;
    } catch {
      return {
        updatedAt: new Date(0).toISOString(),
        issues: {}
      };
    }
  }

  private async writeState(state: WatchdogState): Promise<void> {
    await fs.mkdir(this.config.stateDir, { recursive: true });
    await fs.writeFile(this.config.statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  private currentHead(): string {
    return execFileSync("git", ["-C", this.reactorConfig.repoRoot, "rev-parse", "HEAD"], {
      encoding: "utf8"
    }).trim();
  }

  private readServiceStatus(): ServiceStatus {
    const raw = execFileSync(
      "systemctl",
      [
        "--user",
        "show",
        this.config.reactorServiceName,
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

  private readRecentServiceLogs(): string {
    try {
      return execFileSync(
        "journalctl",
        ["--user", "-u", this.config.reactorServiceName, "-n", "80", "--no-pager"],
        { encoding: "utf8" }
      );
    } catch {
      return "";
    }
  }

  private async restartService(state: WatchdogState | undefined, reason: string): Promise<void> {
    execFileSync("systemctl", ["--user", "restart", this.config.reactorServiceName], {
      stdio: "ignore"
    });
    if (state) {
      state.lastServiceActionAt = new Date().toISOString();
    }
    console.log(`Watchdog restarted ${this.config.reactorServiceName}: ${reason}`);
  }

  private stopService(reason: string): void {
    execFileSync("systemctl", ["--user", "stop", this.config.reactorServiceName], {
      stdio: "ignore"
    });
    console.log(`Watchdog stopped ${this.config.reactorServiceName}: ${reason}`);
  }

  private startService(reason: string): void {
    execFileSync("systemctl", ["--user", "start", this.config.reactorServiceName], {
      stdio: "ignore"
    });
    console.log(`Watchdog started ${this.config.reactorServiceName}: ${reason}`);
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
      requiresCodeChange: false
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

function labelNames(issue: GitHubIssue): Set<string> {
  return new Set(issue.labels.map((label) => label.name).filter(Boolean) as string[]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
