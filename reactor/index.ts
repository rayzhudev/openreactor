import process from "node:process";
import { loadConfig, type OrchestratorConfig } from "./config";
import { GitHubClient, type GitHubIssue, type GitHubPullRequest } from "./github";
import {
  type AgentResult,
  createInitialRunRecord,
  ensureRemoteBranchExists,
  ensureIssueWorktree,
  ensureRuntimeDirectories,
  finalizeIssueAgentRun,
  issueRuntimePaths,
  readRunRecord,
  spawnIssueAgent,
  writeIssueContext,
  writeRunRecord,
  type ActiveRun,
  type RunRecord
} from "./runner";

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

    await this.resumeClaimedIssues(candidates);

    for (const issue of candidates) {
      if (this.activeRuns.size >= this.config.maxConcurrentIssues) {
        break;
      }

      if (!this.isEligibleForClaim(issue)) {
        continue;
      }

      await this.github.addLabels(issue.number, [this.config.runningLabel]);
      await this.startIssue(issue);
    }
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

      if (record.status === "accepted" || record.status === "rejected") {
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

    if (labels.has(this.config.acceptedLabel) || labels.has(this.config.rejectedLabel)) {
      return false;
    }

    return true;
  }

  private async startIssue(issue: GitHubIssue, existingRecord?: RunRecord): Promise<void> {
    const paths = issueRuntimePaths(this.config, issue.number);
    await ensureIssueWorktree(this.config, paths);
    await writeIssueContext(this.config, issue, paths);

    const record = existingRecord ?? (await createInitialRunRecord(issue, paths));
    await writeRunRecord(paths, record);

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
          await this.github.addLabels(issueNumber, [this.config.acceptedLabel]);
          await this.github.removeLabel(issueNumber, this.config.runningLabel);
          return;
        }
      }

      if (result?.outcome === "rejected") {
        await this.github.addLabels(issueNumber, [this.config.rejectedLabel]);
        await this.github.removeLabel(issueNumber, this.config.runningLabel);
        return;
      }

      const nextIteration = activeRun.record.iteration;
      if (nextIteration >= this.config.maxIterationsPerIssue) {
        await this.github.removeLabel(issueNumber, this.config.runningLabel);
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

    const pullRequest = await this.github.findOpenPullRequestByBranch(branchName);
    if (!pullRequest) {
      return { ok: false, reason: `no open pull request found for branch ${branchName}` };
    }

    return { ok: true, pullRequest };
  }
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const dryRun = process.argv.includes("--dry-run");
  const reactor = new Reactor(dryRun);

  process.on("SIGINT", () => {
    reactor.stop();
  });
  process.on("SIGTERM", () => {
    reactor.stop();
  });

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
