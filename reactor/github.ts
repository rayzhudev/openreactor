import { createPrivateKey, sign } from "node:crypto";
import type { OrchestratorConfig } from "./config";

const API_BASE = "https://api.github.com";
const API_VERSION = "2022-11-28";
const USER_AGENT = "OpenReactor-Reactor/0.1";
const APP_JWT_LIFETIME_SECONDS = 9 * 60;
const INSTALLATION_TOKEN_REFRESH_BUFFER_MS = 60_000;

const installationTokenCache = new Map<string, { token: string; expiresAt: number }>();
const installationIdCache = new Map<string, string>();

export interface GitHubIssue {
  id?: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  created_at: string;
  updated_at: string;
  user?: {
    login?: string;
  };
  author_association?: string;
  labels: Array<{ name?: string }>;
  pull_request?: Record<string, unknown>;
}

export interface GitHubPullRequest {
  number: number;
  html_url: string;
  state: string;
  body?: string | null;
  node_id?: string;
  merged_at?: string | null;
  title?: string;
  mergeable?: boolean | null;
  mergeable_state?: string | null;
  head?: {
    ref?: string;
  };
}

export interface GitHubIssueComment {
  id: number;
  body: string;
  updated_at: string;
  user?: {
    login?: string;
  };
  author_association?: string;
}

export class GitHubClient {
  constructor(private readonly config: OrchestratorConfig) {}

  async listRecentlyUpdatedIssues(state: "open" | "closed" | "all" = "all"): Promise<GitHubIssue[]> {
    return this.request<GitHubIssue[]>(
      `/repos/${this.config.owner}/${this.config.repo}/issues?state=${state}&sort=updated&direction=desc&per_page=100`
    );
  }

  async listOpenIssues(): Promise<GitHubIssue[]> {
    return this.request<GitHubIssue[]>(
      `/repos/${this.config.owner}/${this.config.repo}/issues?state=open&sort=created&direction=asc&per_page=100`
    );
  }

  async listOpenPullRequests(): Promise<GitHubPullRequest[]> {
    return this.request<GitHubPullRequest[]>(
      `/repos/${this.config.owner}/${this.config.repo}/pulls?state=open&sort=created&direction=asc&per_page=100`
    );
  }

  async getIssue(issueNumber: number): Promise<GitHubIssue> {
    return this.request<GitHubIssue>(
      `/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}`
    );
  }

  async createIssue(input: {
    title: string;
    body: string;
    labels?: string[];
  }): Promise<GitHubIssue> {
    return this.request<GitHubIssue>(`/repos/${this.config.owner}/${this.config.repo}/issues`, {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        labels: input.labels ?? []
      })
    });
  }

  async updateIssue(
    issueNumber: number,
    input: {
      title?: string;
      body?: string;
      state?: "open" | "closed";
    }
  ): Promise<GitHubIssue> {
    return this.request<GitHubIssue>(
      `/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}`,
      {
        method: "PATCH",
        body: JSON.stringify(input)
      }
    );
  }

  async ensureLabel(name: string, color: string, description: string): Promise<void> {
    const encodedName = encodeURIComponent(name);

    try {
      await this.request(
        `/repos/${this.config.owner}/${this.config.repo}/labels/${encodedName}`
      );
      return;
    } catch (error) {
      if (!(error instanceof Error) || !/\b404\b/.test(error.message)) {
        throw error;
      }
    }

    try {
      await this.request(
        `/repos/${this.config.owner}/${this.config.repo}/labels`,
        {
          method: "POST",
          body: JSON.stringify({ name, color, description })
        }
      );
    } catch (error) {
      if (!(error instanceof Error) || !/\b422\b/.test(error.message)) {
        throw error;
      }
    }
  }

  async addLabels(issueNumber: number, labels: string[]): Promise<void> {
    if (!labels.length) {
      return;
    }

    await this.request(
      `/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}/labels`,
      {
        method: "POST",
        body: JSON.stringify({ labels })
      }
    );
  }

  async removeLabel(issueNumber: number, label: string): Promise<void> {
    const encodedLabel = encodeURIComponent(label);

    try {
      await this.request(
        `/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}/labels/${encodedLabel}`,
        { method: "DELETE" }
      );
    } catch (error) {
      if (!(error instanceof Error) || !/\b404\b/.test(error.message)) {
        throw error;
      }
    }
  }

  async createComment(issueNumber: number, body: string): Promise<void> {
    await this.request(
      `/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}/comments`,
      {
        method: "POST",
        body: JSON.stringify({ body })
      }
    );
  }

  async listIssueComments(issueNumber: number): Promise<GitHubIssueComment[]> {
    return this.request<GitHubIssueComment[]>(
      `/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}/comments?per_page=100`
    );
  }

  async updateComment(commentId: number, body: string): Promise<void> {
    await this.request(
      `/repos/${this.config.owner}/${this.config.repo}/issues/comments/${commentId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ body })
      }
    );
  }

  async closeIssue(
    issueNumber: number,
    stateReason: "completed" | "not_planned"
  ): Promise<void> {
    await this.request(
      `/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          state: "closed",
          state_reason: stateReason
        })
      }
    );
  }

  async reopenIssue(issueNumber: number): Promise<void> {
    await this.request(
      `/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          state: "open"
        })
      }
    );
  }

  async addSubIssue(parentIssueNumber: number, subIssueId: number): Promise<void> {
    await this.request(
      `/repos/${this.config.owner}/${this.config.repo}/issues/${parentIssueNumber}/sub_issues`,
      {
        method: "POST",
        body: JSON.stringify({
          sub_issue_id: subIssueId
        })
      }
    );
  }

  async addBlockedByDependency(issueNumber: number, blockingIssueId: number): Promise<void> {
    await this.request(
      `/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}/dependencies/blocked_by`,
      {
        method: "POST",
        body: JSON.stringify({
          issue_id: blockingIssueId
        })
      }
    );
  }

  async listBlockedByDependencies(issueNumber: number): Promise<GitHubIssue[]> {
    return this.request<GitHubIssue[]>(
      `/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}/dependencies/blocked_by?per_page=100`
    );
  }

  async findOpenPullRequestByBranch(branchName: string): Promise<GitHubPullRequest | null> {
    return this.findPullRequestByBranch(branchName, "open");
  }

  async getPullRequest(pullRequestNumber: number): Promise<GitHubPullRequest> {
    return this.request<GitHubPullRequest>(
      `/repos/${this.config.owner}/${this.config.repo}/pulls/${pullRequestNumber}`
    );
  }

  async createPullRequest(input: {
    title: string;
    body: string;
    head: string;
    base: string;
  }): Promise<GitHubPullRequest> {
    return this.request<GitHubPullRequest>(`/repos/${this.config.owner}/${this.config.repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        head: input.head,
        base: input.base
      })
    });
  }

  async updatePullRequest(
    pullRequestNumber: number,
    input: {
      title?: string;
      body?: string;
      state?: "open" | "closed";
      base?: string;
    }
  ): Promise<GitHubPullRequest> {
    return this.request<GitHubPullRequest>(
      `/repos/${this.config.owner}/${this.config.repo}/pulls/${pullRequestNumber}`,
      {
        method: "PATCH",
        body: JSON.stringify(input)
      }
    );
  }

  async findPullRequestByBranch(
    branchName: string,
    state: "open" | "closed" | "all" = "open"
  ): Promise<GitHubPullRequest | null> {
    const head = encodeURIComponent(`${this.config.owner}:${branchName}`);
    const pulls = await this.request<GitHubPullRequest[]>(
      `/repos/${this.config.owner}/${this.config.repo}/pulls?state=${state}&head=${head}&per_page=10`
    );

    return pulls[0] ?? null;
  }

  async isPullRequestMerged(pullRequestNumber: number): Promise<boolean> {
    const headers = new Headers();
    headers.set("Accept", "application/vnd.github+json");
    headers.set("User-Agent", USER_AGENT);
    headers.set("X-GitHub-Api-Version", API_VERSION);

    const accessToken = await this.getAccessToken();
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }

    const response = await fetch(
      `${API_BASE}/repos/${this.config.owner}/${this.config.repo}/pulls/${pullRequestNumber}/merge`,
      {
        method: "GET",
        headers
      }
    );

    if (response.status === 204) {
      return true;
    }

    if (response.status === 404) {
      return false;
    }

    const detail = await safeErrorDetail(response);
    throw new Error(
      `${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`
    );
  }

  async isPullRequestAutoMergeEnabled(pullRequestNumber: number): Promise<boolean> {
    const pullRequest = await this.getPullRequestGraphNode(pullRequestNumber);
    return Boolean(pullRequest.autoMergeRequest);
  }

  async disablePullRequestAutoMerge(pullRequestNumber: number): Promise<void> {
    const pullRequest = await this.getPullRequestGraphNode(pullRequestNumber);
    if (!pullRequest.autoMergeRequest) {
      return;
    }

    await this.graphqlRequest(
      [
        "mutation($pullRequestId: ID!) {",
        "  disablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId }) {",
        "    clientMutationId",
        "  }",
        "}"
      ].join("\n"),
      {
        pullRequestId: pullRequest.id
      }
    );
  }

  async enablePullRequestAutoMerge(
    pullRequestNumber: number,
    mergeMethod: "MERGE" | "REBASE" | "SQUASH" = "SQUASH"
  ): Promise<void> {
    const pullRequest = await this.getPullRequestGraphNode(pullRequestNumber);
    await this.graphqlRequest(
      [
        "mutation($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {",
        "  enablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId, mergeMethod: $mergeMethod }) {",
        "    clientMutationId",
        "  }",
        "}"
      ].join("\n"),
      {
        pullRequestId: pullRequest.id,
        mergeMethod
      }
    );
  }

  private async request<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/vnd.github+json");
    headers.set("User-Agent", USER_AGENT);
    headers.set("X-GitHub-Api-Version", API_VERSION);

    const accessToken = await this.getAccessToken();
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }

    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers
    });

    if (!response.ok) {
      const detail = await safeErrorDetail(response);
      throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private async graphqlRequest<T = unknown>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const headers = new Headers();
    headers.set("Accept", "application/vnd.github+json");
    headers.set("User-Agent", USER_AGENT);
    headers.set("X-GitHub-Api-Version", API_VERSION);
    headers.set("Content-Type", "application/json");

    const accessToken = await this.getAccessToken();
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }

    const response = await fetch(`${API_BASE}/graphql`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query,
        variables: variables ?? {}
      })
    });

    const payload = (await response.json()) as {
      data?: T;
      errors?: Array<{ message?: string }>;
    };

    if (!response.ok || payload.errors?.length) {
      const detail = payload.errors?.map((error) => error.message).filter(Boolean).join("; ") ?? "";
      throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`);
    }

    return payload.data as T;
  }

  async getAgentAccessToken(): Promise<string> {
    return this.getAccessToken();
  }

  private async getAccessToken(): Promise<string> {
    if (this.hasGitHubAppAuth()) {
      return this.getInstallationAccessToken();
    }

    return this.config.githubToken;
  }

  private hasGitHubAppAuth(): boolean {
    return Boolean(this.config.githubAppId && this.config.githubAppPrivateKey);
  }

  private async getInstallationAccessToken(): Promise<string> {
    const cacheKey =
      `${this.config.githubAppId}:` +
      `${this.config.githubAppInstallationId || `${this.config.owner}/${this.config.repo}`}`;
    const cached = installationTokenCache.get(cacheKey);

    if (cached && cached.expiresAt - INSTALLATION_TOKEN_REFRESH_BUFFER_MS > Date.now()) {
      return cached.token;
    }

    const appJwt = this.createGitHubAppJwt();
    const installationId =
      this.config.githubAppInstallationId || (await this.discoverInstallationId(appJwt));
    const tokenResponse = await this.githubAppRequest<{ token: string; expires_at: string }>(
      appJwt,
      `/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        body: JSON.stringify({})
      }
    );

    installationIdCache.set(`${this.config.owner}/${this.config.repo}`, installationId);
    installationTokenCache.set(cacheKey, {
      token: tokenResponse.token,
      expiresAt: Date.parse(tokenResponse.expires_at)
    });

    return tokenResponse.token;
  }

  private async discoverInstallationId(appJwt: string): Promise<string> {
    const cacheKey = `${this.config.owner}/${this.config.repo}`;
    const cached = installationIdCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const installation = await this.githubAppRequest<{ id: number }>(
      appJwt,
      `/repos/${this.config.owner}/${this.config.repo}/installation`
    );

    const installationId = String(installation.id);
    installationIdCache.set(cacheKey, installationId);
    return installationId;
  }

  private async githubAppRequest<T>(appJwt: string, path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/vnd.github+json");
    headers.set("Authorization", `Bearer ${appJwt}`);
    headers.set("User-Agent", USER_AGENT);
    headers.set("X-GitHub-Api-Version", API_VERSION);

    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers
    });

    if (!response.ok) {
      const detail = await safeErrorDetail(response);
      throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`);
    }

    return (await response.json()) as T;
  }

  private createGitHubAppJwt(): string {
    const now = Math.floor(Date.now() / 1000);
    const header = encodeJsonBase64Url({ alg: "RS256", typ: "JWT" });
    const payload = encodeJsonBase64Url({
      iat: now - 60,
      exp: now + APP_JWT_LIFETIME_SECONDS,
      iss: this.config.githubAppClientId || this.config.githubAppId
    });
    const signingInput = `${header}.${payload}`;
    const signature = sign(
      "RSA-SHA256",
      Buffer.from(signingInput),
      createPrivateKey(this.config.githubAppPrivateKey)
    );

    return `${signingInput}.${toBase64Url(signature)}`;
  }

  private async getPullRequestGraphNode(pullRequestNumber: number): Promise<{
    id: string;
    autoMergeRequest: { enabledAt?: string | null } | null;
  }> {
    const data = await this.graphqlRequest<{
      repository: {
        pullRequest: {
          id: string;
          autoMergeRequest: { enabledAt?: string | null } | null;
        } | null;
      };
    }>(
      [
        "query($owner: String!, $repo: String!, $number: Int!) {",
        "  repository(owner: $owner, name: $repo) {",
        "    pullRequest(number: $number) {",
        "      id",
        "      autoMergeRequest {",
        "        enabledAt",
        "      }",
        "    }",
        "  }",
        "}"
      ].join("\n"),
      {
        owner: this.config.owner,
        repo: this.config.repo,
        number: pullRequestNumber
      }
    );

    const pullRequest = data.repository.pullRequest;
    if (!pullRequest) {
      throw new Error(`Unable to load pull request #${pullRequestNumber} for auto-merge inspection.`);
    }

    return pullRequest;
  }
}

function encodeJsonBase64Url(value: Record<string, number | string>): string {
  return toBase64Url(Buffer.from(JSON.stringify(value)));
}

function toBase64Url(value: Buffer): string {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function safeErrorDetail(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return "";
  }

  try {
    const data = (await response.json()) as { message?: string };
    return data.message ?? "";
  } catch {
    return "";
  }
}
