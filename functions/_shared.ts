import { createPrivateKey } from "node:crypto";

const REQUEST_MARKER = "<!-- openreactor:feature-request -->";
const STATUS_COMMENT_MARKER = "<!-- openreactor:status -->";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_USER_AGENT = "OpenReactor/0.1";
const MAX_ARCHIVE_ITEMS = 12;
const MAX_LEADERBOARD_ITEMS = 8;
const MAX_LEADERBOARD_PAGES = 10;
const GITHUB_ISSUES_PER_PAGE = 100;
const MAX_GITHUB_REQUEST_PAGES = 10;
const APP_JWT_LIFETIME_SECONDS = 9 * 60;
const INSTALLATION_TOKEN_REFRESH_BUFFER_MS = 60_000;

const installationTokenCache = new Map<string, { token: string; expiresAt: number }>();
const installationIdCache = new Map<string, string>();
const signingKeyCache = new Map<string, Promise<CryptoKey>>();

export interface Env {
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_TOKEN?: string;
  GITHUB_LABELS?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_APP_INSTALLATION_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
}

interface NormalizedEnv {
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_TOKEN: string;
  GITHUB_LABELS: string;
  GITHUB_APP_ID: string;
  GITHUB_APP_CLIENT_ID: string;
  GITHUB_APP_INSTALLATION_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
}

interface FeatureRequestInput {
  name?: string;
  contact?: string;
  githubUsername?: string;
  summary: string;
  problem: string;
  outcome: string;
  constraints?: string;
  successCriteria?: string;
  notes?: string;
  website?: string;
}

interface ValidatedFeatureRequest {
  name: string;
  contact: string;
  githubUsername: string;
  summary: string;
  problem: string;
  outcome: string;
  constraints: string;
  successCriteria: string;
  notes: string;
}

interface GitHubIssue {
  number: number;
  html_url: string;
  title: string;
  body?: string;
  comments?: number;
  created_at: string;
  state: "open" | "closed";
  pull_request?: Record<string, unknown>;
  labels?: Array<{ name?: string }>;
}
interface GitHubIssueComment {
  body?: string;
  updated_at?: string;
}

interface GitHubPullRequest {
  number: number;
  html_url: string;
  title: string;
  merged_at?: string | null;
  user?: {
    login?: string;
    html_url?: string;
    type?: string;
  };
}

interface GitHubRepo {
  default_branch: string;
  html_url: string;
}

interface GitHubCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author?: {
      name?: string;
      date?: string;
    };
    committer?: {
      name?: string;
      date?: string;
    };
  };
}

interface LeaderboardContributor {
  login: string;
  profileUrl: string;
  accountType: string;
  mergedCount: number;
  latestMergedAt: string;
  latestPullRequest: {
    number: number;
    title: string;
    url: string;
  };
}

export async function handleMeta(env: Env): Promise<Response> {
  return jsonResponse({
    configured: isRepoConfigured(env),
    repoUrl: getRepoUrl(env),
    authMode: getGitHubAuthMode(env)
  });
}

export async function handleHealth(env: Env): Promise<Response> {
  const normalized = normalizeEnv(env);
  return jsonResponse({
    ok: true,
    repoConfigured: isRepoConfigured(env),
    submissionConfigured: isSubmissionConfigured(env),
    apiAuthConfigured: hasGitHubApiAuth(env),
    authMode: getGitHubAuthMode(env),
    appInstallationHint: hasGitHubAppAuth(normalized)
      ? {
          appId: normalized.GITHUB_APP_ID,
          installationIdConfigured: Boolean(normalized.GITHUB_APP_INSTALLATION_ID)
        }
      : null
  });
}

export async function handleListRequests(request: Request, env: Env): Promise<Response> {
  const normalized = normalizeEnv(env);

  if (!isRepoConfigured(normalized)) {
    return jsonResponse({
      items: [],
      activeItems: [],
      archivedItems: [],
      repoUrl: null,
      archivePage: 1,
      archivePageSize: MAX_ARCHIVE_ITEMS,
      archiveTotal: 0,
      archiveHasPreviousPage: false,
      archiveHasNextPage: false
    });
  }

  try {
    const archivePage = getQueuePage(request);
    const issues = await listRequestIssues(normalized);
    const activeIssues = issues.filter((issue) => !isArchivedIssue(issue));
    const archivedIssues = issues.filter((issue) => isArchivedIssue(issue));
    const start = (archivePage - 1) * MAX_ARCHIVE_ITEMS;
    const visibleArchivedIssues = archivedIssues.slice(start, start + MAX_ARCHIVE_ITEMS);
    const [activeItems, archivedItems] = await Promise.all([
      Promise.all(activeIssues.map((issue) => mapQueueIssue(normalized, issue))),
      Promise.all(visibleArchivedIssues.map((issue) => mapQueueIssue(normalized, issue)))
    ]);

    const repoUrl = getRepoUrl(normalized);
    const archiveHasPreviousPage = archivePage > 1;
    const archiveHasNextPage = archivedIssues.length > start + MAX_ARCHIVE_ITEMS;
    const archiveTotal = archivedIssues.length;
    const items = [...activeItems, ...archivedItems];
    const etag = buildQueueEtag({
      items,
      page: archivePage,
      hasPreviousPage: archiveHasPreviousPage,
      hasNextPage: archiveHasNextPage,
      totalItems: archiveTotal
    });

    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          "Cache-Control": "no-store",
          ETag: etag,
          ...corsHeaders()
        }
      });
    }

    return jsonResponse(
      {
        items,
        activeItems,
        archivedItems,
        repoUrl,
        archivePage,
        archivePageSize: MAX_ARCHIVE_ITEMS,
        archiveTotal,
        archiveHasPreviousPage,
        archiveHasNextPage
      },
      200,
      {
        ETag: etag
      }
    );
  } catch (error) {
    return errorResponse("Unable to load the request queue.", 502, error);
  }
}

export async function handleLeaderboard(env: Env): Promise<Response> {
  const normalized = normalizeEnv(env);

  if (!isRepoConfigured(normalized)) {
    return jsonResponse({
      items: [],
      repoUrl: null,
      totals: {
        mergedPullRequests: 0,
        contributors: 0,
        latestMergedAt: null
      }
    });
  }

  try {
    const pullRequests = await listMergedPullRequests(normalized);
    const leaderboard = buildLeaderboard(pullRequests);

    return jsonResponse({
      items: leaderboard.items,
      repoUrl: getRepoUrl(normalized),
      totals: leaderboard.totals
    });
  } catch (error) {
    return errorResponse("Unable to load the contributor leaderboard.", 502, error);
  }
}

export async function handleUpdatesFeed(request: Request, env: Env): Promise<Response> {
  const normalized = normalizeEnv(env);

  if (!isRepoConfigured(normalized)) {
    return xmlResponse(buildUpdatesFeed([], request, null), 503);
  }

  try {
    const repo = await githubRequestWithFallback<GitHubRepo>(
      normalized,
      `/repos/${normalized.GITHUB_OWNER}/${normalized.GITHUB_REPO}`
    );
    const commits = await githubRequestWithFallback<GitHubCommit[]>(
      normalized,
      `/repos/${normalized.GITHUB_OWNER}/${normalized.GITHUB_REPO}/commits?sha=${encodeURIComponent(
        repo.default_branch
      )}&per_page=12`
    );

    return xmlResponse(buildUpdatesFeed(commits, request, repo.html_url));
  } catch (error) {
    console.error("Unable to build updates feed.", error);
    return xmlResponse(buildUpdatesFeed([], request, getRepoUrl(normalized)), 502);
  }
}

export async function handleCreateRequest(request: Request, env: Env): Promise<Response> {
  const normalized = normalizeEnv(env);

  if (!isRepoConfigured(normalized)) {
    return jsonResponse(
      { error: "Submissions are not configured yet. Add GitHub repository settings." },
      503
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return jsonResponse({ error: "Expected application/json." }, 415);
  }

  let payload: FeatureRequestInput;
  try {
    payload = (await request.json()) as FeatureRequestInput;
  } catch {
    return jsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  const validated = validateFeatureRequest(payload);
  if ("error" in validated) {
    return jsonResponse({ error: validated.error }, 400);
  }

  const fallbackUrl = buildIssueCreateUrl(normalized, validated, request);
  const labels = await getExistingLabels(normalized);
  const body = buildIssueBody(validated, request);

  if (!hasGitHubApiAuth(normalized)) {
    return jsonResponse(
      {
        mode: "github_redirect",
        url: fallbackUrl
      },
      200
    );
  }

  try {
    const issue = await githubRequest<GitHubIssue>(
      normalized,
      `/repos/${normalized.GITHUB_OWNER}/${normalized.GITHUB_REPO}/issues`,
      {
        method: "POST",
        body: JSON.stringify({
          title: `[Request] ${validated.summary}`,
          body,
          labels
        })
      }
    );

    return jsonResponse(
      {
        mode: "created",
        number: issue.number,
        url: issue.html_url
      },
      201
    );
  } catch (error) {
    if (hasGitHubAppAuth(normalized) || isGithubAuthError(error)) {
      console.warn("Falling back to GitHub issue URL after API auth failure.", error);
      return jsonResponse(
        {
          mode: "github_redirect",
          url: fallbackUrl
        },
        200
      );
    }

    return errorResponse("GitHub issue creation failed.", 502, error);
  }
}

export function handleOptions(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function validateFeatureRequest(input: FeatureRequestInput): ValidatedFeatureRequest | { error: string } {
  if ((input.website ?? "").trim() !== "") {
    return { error: "Submission rejected." };
  }

  const summary = clean(input.summary);
  const problem = clean(input.problem);
  const outcome = clean(input.outcome);
  const constraints = clean(input.constraints);
  const successCriteria = clean(input.successCriteria);
  const notes = clean(input.notes);
  const name = clean(input.name);
  const contact = clean(input.contact);
  const githubUsername = normalizeGitHubUsername(input.githubUsername);

  if (summary.length < 8 || summary.length > 120) {
    return { error: "Summary must be between 8 and 120 characters." };
  }

  if (problem.length < 20 || problem.length > 1200) {
    return { error: "Problem must be between 20 and 1200 characters." };
  }

  if (outcome.length < 20 || outcome.length > 1200) {
    return { error: "Outcome must be between 20 and 1200 characters." };
  }

  if (constraints.length > 800) {
    return { error: "Constraints must be 800 characters or fewer." };
  }

  if (successCriteria.length > 800) {
    return { error: "Success criteria must be 800 characters or fewer." };
  }

  if (notes.length > 1000) {
    return { error: "Notes must be 1000 characters or fewer." };
  }

  if (name.length > 80) {
    return { error: "Name must be 80 characters or fewer." };
  }

  if (contact.length > 160) {
    return { error: "Contact must be 160 characters or fewer." };
  }

  if (githubUsername && !isValidGitHubUsername(githubUsername)) {
    return {
      error:
        "GitHub username must be 1 to 39 characters using letters, numbers, or single hyphens."
    };
  }

  const lowSignalFields: Array<[label: string, value: string]> = [
    ["Summary", summary],
    ["Problem", problem],
    ["Outcome", outcome]
  ];

  for (const [label, value] of lowSignalFields) {
    if (isLowSignalText(value)) {
      return {
        error: `${label} must describe the request in plain language instead of repeated or placeholder text.`
      };
    }
  }

  return {
    name,
    contact,
    githubUsername,
    summary,
    problem,
    outcome,
    constraints,
    successCriteria,
    notes
  };
}

function buildIssueBody(input: ValidatedFeatureRequest, request: Request): string {
  const url = new URL(request.url);
  const submittedAt = new Date().toISOString();
  const origin = `${url.protocol}//${url.host}`;

  return [
    REQUEST_MARKER,
    "",
    "## Summary",
    input.summary,
    "",
    "## Problem",
    input.problem,
    "",
    "## Desired Outcome",
    input.outcome,
    "",
    "## Constraints",
    input.constraints || "_None provided._",
    "",
    "## Success Criteria",
    input.successCriteria || "_None provided._",
    "",
    "## Additional Notes",
    input.notes || "_None provided._",
    "",
    "## Submitted By",
    input.name || "_Anonymous_",
    "",
    "## GitHub Username",
    input.githubUsername ? `@${input.githubUsername}` : "_Not provided_",
    "",
    "## Contact",
    input.contact || "_Not provided_",
    "",
    "## Intake Metadata",
    `- Submitted at: ${submittedAt}`,
    `- Origin: ${origin}`
  ].join("\n");
}

async function getExistingLabels(env: Env): Promise<string[]> {
  const normalized = normalizeEnv(env);
  const configuredLabels = normalized.GITHUB_LABELS
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!configuredLabels.length || !isRepoConfigured(normalized)) {
    return [];
  }

  try {
    const labels = await githubRequestWithFallback<Array<{ name?: string }>>(
      normalized,
      `/repos/${normalized.GITHUB_OWNER}/${normalized.GITHUB_REPO}/labels?per_page=100`
    );

    const available = new Set(labels.map((label) => label.name).filter(Boolean));
    return configuredLabels.filter((label) => available.has(label));
  } catch {
    return [];
  }
}

async function listMergedPullRequests(env: Env): Promise<GitHubPullRequest[]> {
  const mergedPullRequests: GitHubPullRequest[] = [];

  for (let page = 1; page <= MAX_LEADERBOARD_PAGES; page += 1) {
    const pullRequests = await githubRequestWithFallback<GitHubPullRequest[]>(
      env,
      `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`
    );

    if (!pullRequests.length) {
      break;
    }

    mergedPullRequests.push(...pullRequests.filter((pullRequest) => Boolean(pullRequest.merged_at)));

    if (pullRequests.length < 100) {
      break;
    }
  }

  return mergedPullRequests;
}

function buildLeaderboard(pullRequests: GitHubPullRequest[]): {
  items: LeaderboardContributor[];
  totals: {
    mergedPullRequests: number;
    contributors: number;
    latestMergedAt: string | null;
  };
} {
  const contributors = new Map<string, LeaderboardContributor>();
  let latestMergedAt: string | null = null;

  for (const pullRequest of pullRequests) {
    const login = pullRequest.user?.login?.trim();
    const profileUrl = pullRequest.user?.html_url?.trim();
    const mergedAt = pullRequest.merged_at ?? "";

    if (!login || !profileUrl || !mergedAt) {
      continue;
    }

    const current = contributors.get(login);

    if (!current) {
      contributors.set(login, {
        login,
        profileUrl,
        accountType: pullRequest.user?.type ?? "User",
        mergedCount: 1,
        latestMergedAt: mergedAt,
        latestPullRequest: {
          number: pullRequest.number,
          title: pullRequest.title,
          url: pullRequest.html_url
        }
      });
    } else {
      current.mergedCount += 1;

      if (Date.parse(mergedAt) > Date.parse(current.latestMergedAt)) {
        current.latestMergedAt = mergedAt;
        current.latestPullRequest = {
          number: pullRequest.number,
          title: pullRequest.title,
          url: pullRequest.html_url
        };
      }
    }

    if (!latestMergedAt || Date.parse(mergedAt) > Date.parse(latestMergedAt)) {
      latestMergedAt = mergedAt;
    }
  }

  const items = [...contributors.values()]
    .sort((left, right) => {
      if (right.mergedCount !== left.mergedCount) {
        return right.mergedCount - left.mergedCount;
      }

      return Date.parse(right.latestMergedAt) - Date.parse(left.latestMergedAt);
    })
    .slice(0, MAX_LEADERBOARD_ITEMS);

  return {
    items,
    totals: {
      mergedPullRequests: pullRequests.length,
      contributors: contributors.size,
      latestMergedAt
    }
  };
}

async function getIssueStatusUpdate(
  env: Env,
  issueNumber: number
): Promise<{ detail: string; updatedAt: string | null } | null> {
  try {
    const normalized = normalizeEnv(env);
    const comments = await githubRequestWithFallback<GitHubIssueComment[]>(
      normalized,
      `/repos/${normalized.GITHUB_OWNER}/${normalized.GITHUB_REPO}/issues/${issueNumber}/comments?per_page=100`
    );
    const statusComment = comments.find((comment) =>
      (comment.body ?? "").includes(STATUS_COMMENT_MARKER)
    );

    if (!statusComment?.body) {
      return null;
    }

    const detail = extractStatusField(statusComment.body, "Detail");
    if (!detail) {
      return null;
    }

    return {
      detail,
      updatedAt: extractStatusField(statusComment.body, "Updated") || statusComment.updated_at || null
    };
  } catch {
    return null;
  }
}

async function githubRequest<T>(env: Env, path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", GITHUB_API_VERSION);
  headers.set("User-Agent", GITHUB_USER_AGENT);

  const accessToken = await getGitHubAccessToken(env);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const detail = await safeErrorDetail(response);
    throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`);
  }

  return (await response.json()) as T;
}

async function githubRequestWithFallback<T>(env: Env, path: string, init?: RequestInit): Promise<T> {
  try {
    return await githubRequest<T>(env, path, init);
  } catch (error) {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET" || !hasGitHubApiAuth(env)) {
      throw error;
    }

    const withoutToken = {
      ...env,
      GITHUB_APP_ID: "",
      GITHUB_APP_CLIENT_ID: "",
      GITHUB_APP_INSTALLATION_ID: "",
      GITHUB_APP_PRIVATE_KEY: "",
      GITHUB_TOKEN: ""
    };

    return githubRequest<T>(withoutToken, path, init);
  }
}

function getIssueStatus(issue: GitHubIssue): string {
  const labelNames = new Set((issue.labels ?? []).map((label) => (label.name ?? "").toLowerCase()));

  if (labelNames.has("rejected")) {
    return "rejected";
  }

  if (issue.state === "closed") {
    return "complete";
  }

  if (labelNames.has("or:running") || labelNames.has("accepted")) {
    return "in-progress";
  }

  return "queued";
}

function isArchivedIssue(issue: GitHubIssue): boolean {
  const status = getIssueStatus(issue);
  return status === "complete" || status === "rejected";
}

function extractStatusField(body: string, label: string): string {
  const match = body.match(new RegExp(`^${label}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() ?? "";
}

function getIssueGitHubUsername(issue: GitHubIssue): string | null {
  const value = getIssueSectionValue(issue.body, "GitHub Username");

  if (!value || /^_not provided_$/i.test(value)) {
    return null;
  }

  const normalized = normalizeGitHubUsername(value);
  return isValidGitHubUsername(normalized) ? normalized : null;
}

function getIssueSectionValue(body: string | undefined, heading: string): string {
  if (!body) {
    return "";
  }

  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`^## ${escapedHeading}\\n([\\s\\S]*?)(?:\\n## |$)`, "m"));

  return clean(match?.[1]);
}

async function listRequestIssues(env: Env): Promise<GitHubIssue[]> {
  const requestIssues: GitHubIssue[] = [];
  const normalized = normalizeEnv(env);

  for (let currentPage = 1; currentPage <= MAX_GITHUB_REQUEST_PAGES; currentPage += 1) {
    const issues = await githubRequestWithFallback<GitHubIssue[]>(
      normalized,
      `/repos/${normalized.GITHUB_OWNER}/${normalized.GITHUB_REPO}/issues?state=all&sort=created&direction=desc&per_page=${GITHUB_ISSUES_PER_PAGE}&page=${currentPage}`
    );

    requestIssues.push(
      ...issues
        .filter((issue) => !issue.pull_request)
        .filter((issue) => (issue.body ?? "").includes(REQUEST_MARKER) || issue.title.startsWith("[Request] "))
    );

    if (issues.length < GITHUB_ISSUES_PER_PAGE) {
      break;
    }
  }

  return requestIssues;
}

async function mapQueueIssue(env: Env, issue: GitHubIssue) {
  const statusUpdate = await getIssueStatusUpdate(env, issue.number);

  return {
    number: issue.number,
    title: issue.title.replace(/^\[Request\]\s*/, ""),
    url: issue.html_url,
    commentUrl: issue.html_url,
    commentCount: issue.comments ?? 0,
    createdAt: issue.created_at,
    status: getIssueStatus(issue),
    githubUsername: getIssueGitHubUsername(issue),
    statusDetail: statusUpdate?.detail ?? null,
    statusUpdatedAt: statusUpdate?.updatedAt ?? null
  };
}

function getQueuePage(request: Request): number {
  const value = new URL(request.url).searchParams.get("page");
  const page = Number.parseInt(value ?? "1", 10);

  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }

  return page;
}

function getRepoUrl(env: Env): string | null {
  const normalized = normalizeEnv(env);

  if (!isRepoConfigured(normalized)) {
    return null;
  }

  return `https://github.com/${normalized.GITHUB_OWNER}/${normalized.GITHUB_REPO}`;
}

function isRepoConfigured(env: Env): boolean {
  return Boolean(normalizeEnv(env).GITHUB_OWNER && normalizeEnv(env).GITHUB_REPO);
}

function isSubmissionConfigured(env: Env): boolean {
  return Boolean(isRepoConfigured(env));
}

function buildIssueCreateUrl(env: Env, input: ValidatedFeatureRequest, request: Request): string {
  const title = `[Request] ${input.summary}`;
  const body = buildIssueBody(input, request);
  const normalized = normalizeEnv(env);
  const url = new URL(`https://github.com/${normalized.GITHUB_OWNER}/${normalized.GITHUB_REPO}/issues/new`);

  url.searchParams.set("title", title);
  url.searchParams.set("body", body);

  const labels = normalized.GITHUB_LABELS
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (labels.length) {
    url.searchParams.set("labels", labels.join(","));
  }

  return url.toString();
}

function jsonResponse(
  data: Record<string, unknown>,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
      ...corsHeaders()
    }
  });
}

function xmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300"
    }
  });
}

function errorResponse(message: string, status: number, error: unknown): Response {
  console.error(message, error);
  return jsonResponse({ error: message }, status);
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function buildUpdatesFeed(commits: GitHubCommit[], request: Request, repoUrl: string | null): string {
  const siteUrl = new URL(request.url);
  const homeUrl = `${siteUrl.protocol}//${siteUrl.host}/`;
  const feedUrl = request.url;
  const sourceUrl = repoUrl || homeUrl;
  const latestDate = commits[0]?.commit.committer?.date || commits[0]?.commit.author?.date;

  const items = commits
    .map((commit) => {
      const title = firstLine(commit.commit.message) || `Update ${commit.sha.slice(0, 7)}`;
      const descriptionParts = [
        `Commit ${commit.sha.slice(0, 7)}`,
        commit.commit.author?.name || commit.commit.committer?.name || "OpenReactor"
      ];
      const detail = remainingLines(commit.commit.message);
      if (detail) {
        descriptionParts.push(detail);
      }

      return [
        "<item>",
        `<title>${escapeXml(title)}</title>`,
        `<link>${escapeXml(commit.html_url)}</link>`,
        `<guid>${escapeXml(commit.html_url)}</guid>`,
        `<description>${escapeXml(descriptionParts.join(" \u2014 "))}</description>`,
        `<pubDate>${escapeXml(
          new Date(commit.commit.committer?.date || commit.commit.author?.date || Date.now()).toUTCString()
        )}</pubDate>`,
        "</item>"
      ].join("");
    })
    .join("");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "<channel>",
    "<title>OpenReactor website updates</title>",
    `<link>${escapeXml(homeUrl)}</link>`,
    "<description>Subscribe to OpenReactor site updates sourced from the repository default branch.</description>",
    `<atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    `<docs>https://www.rssboard.org/rss-specification</docs>`,
    `<generator>OpenReactor</generator>`,
    `<language>en-us</language>`,
    `<lastBuildDate>${escapeXml(new Date(latestDate || Date.now()).toUTCString())}</lastBuildDate>`,
    `<managingEditor>noreply@openreactor.net (OpenReactor)</managingEditor>`,
    `<webMaster>noreply@openreactor.net (OpenReactor)</webMaster>`,
    `<ttl>5</ttl>`,
    items ||
      [
        "<item>",
        "<title>OpenReactor updates feed initialized</title>",
        `<link>${escapeXml(sourceUrl)}</link>`,
        `<guid>${escapeXml(feedUrl)}#initialized</guid>`,
        "<description>The feed is live and will list new website updates as commits land on the default branch.</description>",
        `<pubDate>${escapeXml(new Date().toUTCString())}</pubDate>`,
        "</item>"
      ].join(""),
    "</channel>",
    "</rss>"
  ].join("");
}

function firstLine(value: string): string {
  return value.split("\n")[0]?.trim() ?? "";
}

function remainingLines(value: string): string {
  return value
    .split("\n")
    .slice(1)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clean(value?: string): string {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

function normalizeGitHubUsername(value?: string): string {
  return clean(value).replace(/^@+/, "");
}

function isValidGitHubUsername(value: string): boolean {
  return /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(value);
}

function isLowSignalText(value: string): boolean {
  const normalized = clean(value).toLowerCase();
  const alphanumeric = normalized.replace(/[^a-z0-9]+/g, "");

  if (alphanumeric.length < 12) {
    return false;
  }

  if (new Set(alphanumeric).size <= 3) {
    return true;
  }

  if (/([a-z0-9])\1{7,}/.test(alphanumeric)) {
    return true;
  }

  const words = normalized.split(/[^a-z0-9]+/).filter(Boolean);

  if (words.length === 1 && alphanumeric.length >= 24) {
    return true;
  }

  if (words.length >= 6 && new Set(words).size <= 2) {
    return true;
  }

  return false;
}

function buildQueueEtag({
  items,
  page,
  hasPreviousPage,
  hasNextPage,
  totalItems
}: {
  items: Array<{
    number: number;
    createdAt: string;
    status: string;
    commentCount?: number;
    githubUsername?: string | null;
    statusDetail?: string | null;
    statusUpdatedAt?: string | null;
  }>;
  page: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  totalItems: number;
}): string {
  const signature = items
    .map(
      (item) =>
        `${item.number}:${item.status}:${item.createdAt}:${item.commentCount ?? 0}:${item.githubUsername ?? ""}:${item.statusUpdatedAt ?? ""}:${item.statusDetail ?? ""}`
    )
    .join("|");
  const pageState = `${page}:${hasPreviousPage ? 1 : 0}:${hasNextPage ? 1 : 0}:${totalItems}`;
  return `W/"${pageState}:${signature || "empty"}"`;
}

function normalizeEnv(env: Env): NormalizedEnv {
  return {
    GITHUB_OWNER: clean(env.GITHUB_OWNER),
    GITHUB_REPO: clean(env.GITHUB_REPO),
    GITHUB_TOKEN: clean(env.GITHUB_TOKEN).replace(/\s+/g, ""),
    GITHUB_LABELS: clean(env.GITHUB_LABELS),
    GITHUB_APP_ID: clean(env.GITHUB_APP_ID),
    GITHUB_APP_CLIENT_ID: clean(env.GITHUB_APP_CLIENT_ID),
    GITHUB_APP_INSTALLATION_ID: clean(env.GITHUB_APP_INSTALLATION_ID),
    GITHUB_APP_PRIVATE_KEY: cleanPrivateKey(env.GITHUB_APP_PRIVATE_KEY)
  };
}

function isGithubAuthError(error: unknown): boolean {
  return error instanceof Error && /\b(401|403)\b/.test(error.message);
}

function hasGitHubApiAuth(env: Env): boolean {
  const normalized = normalizeEnv(env);
  return hasGitHubAppAuth(normalized) || Boolean(normalized.GITHUB_TOKEN);
}

function hasGitHubAppAuth(env: Env): boolean {
  const normalized = normalizeEnv(env);
  return Boolean(normalized.GITHUB_APP_ID && normalized.GITHUB_APP_PRIVATE_KEY);
}

function getGitHubAuthMode(env: Env): "app" | "token" | "redirect" | "unconfigured" {
  const normalized = normalizeEnv(env);

  if (!isRepoConfigured(normalized)) {
    return "unconfigured";
  }

  if (hasGitHubAppAuth(normalized)) {
    return "app";
  }

  if (normalized.GITHUB_TOKEN) {
    return "token";
  }

  return "redirect";
}

async function getGitHubAccessToken(env: Env): Promise<string> {
  const normalized = normalizeEnv(env);

  if (hasGitHubAppAuth(normalized)) {
    return getInstallationAccessToken(normalized);
  }

  return normalized.GITHUB_TOKEN;
}

async function getInstallationAccessToken(env: NormalizedEnv): Promise<string> {
  const cacheKey = `${env.GITHUB_APP_ID}:${env.GITHUB_APP_INSTALLATION_ID || `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`}`;
  const cached = installationTokenCache.get(cacheKey);

  if (cached && cached.expiresAt - INSTALLATION_TOKEN_REFRESH_BUFFER_MS > Date.now()) {
    return cached.token;
  }

  const appJwt = await createGitHubAppJwt(env);
  const installationId = env.GITHUB_APP_INSTALLATION_ID || (await discoverInstallationId(env, appJwt));
  const tokenResponse = await githubAppRequest<{ token: string; expires_at: string }>(
    appJwt,
    `/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      body: JSON.stringify({})
    }
  );

  installationIdCache.set(`${env.GITHUB_OWNER}/${env.GITHUB_REPO}`, installationId);
  installationTokenCache.set(cacheKey, {
    token: tokenResponse.token,
    expiresAt: Date.parse(tokenResponse.expires_at)
  });

  return tokenResponse.token;
}

async function discoverInstallationId(env: NormalizedEnv, appJwt: string): Promise<string> {
  const cacheKey = `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
  const cached = installationIdCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const installation = await githubAppRequest<{ id: number }>(
    appJwt,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/installation`
  );

  const installationId = String(installation.id);
  installationIdCache.set(cacheKey, installationId);
  return installationId;
}

async function githubAppRequest<T>(appJwt: string, path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${appJwt}`);
  headers.set("User-Agent", GITHUB_USER_AGENT);
  headers.set("X-GitHub-Api-Version", GITHUB_API_VERSION);

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const detail = await safeErrorDetail(response);
    throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`);
  }

  return (await response.json()) as T;
}

async function createGitHubAppJwt(env: NormalizedEnv): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJsonBase64Url({
    alg: "RS256",
    typ: "JWT"
  });
  const payload = encodeJsonBase64Url({
    iat: now - 60,
    exp: now + APP_JWT_LIFETIME_SECONDS,
    iss: env.GITHUB_APP_CLIENT_ID || env.GITHUB_APP_ID
  });
  const signingInput = `${header}.${payload}`;
  const signingKey = await importSigningKey(env.GITHUB_APP_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signingKey,
    toArrayBuffer(new TextEncoder().encode(signingInput))
  );

  return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
}

function encodeJsonBase64Url(value: Record<string, number | string>): string {
  return toBase64Url(Buffer.from(JSON.stringify(value)));
}

function toBase64Url(value: Buffer | Uint8Array): string {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function cleanPrivateKey(value?: string): string {
  return clean(value).replace(/\\n/g, "\n");
}

async function importSigningKey(privateKeyPem: string): Promise<CryptoKey> {
  const cached = signingKeyCache.get(privateKeyPem);
  if (cached) {
    return cached;
  }

  const imported = (async () => {
    const privateKey = createPrivateKey(privateKeyPem);
    const pkcs8 = privateKey.export({
      format: "der",
      type: "pkcs8"
    });

    return crypto.subtle.importKey(
      "pkcs8",
      toArrayBuffer(pkcs8),
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256"
      },
      false,
      ["sign"]
    );
  })();

  signingKeyCache.set(privateKeyPem, imported);
  return imported;
}

function toArrayBuffer(value: Buffer | ArrayBuffer | Uint8Array): ArrayBuffer {
  if (value instanceof ArrayBuffer) {
    return value;
  }

  const view = value as Uint8Array;
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
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
