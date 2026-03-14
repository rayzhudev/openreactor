import { createPrivateKey } from "node:crypto";

const REQUEST_MARKER = "<!-- openreactor:feature-request -->";
const STATUS_COMMENT_MARKER = "<!-- openreactor:status -->";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_USER_AGENT = "OpenReactor/0.1";
const MAX_ARCHIVE_ITEMS = 12;
const MAX_TRACKED_REQUESTS = 24;
const MAX_LEADERBOARD_ITEMS = 8;
const MAX_LEADERBOARD_PAGES = 10;
const MAX_LEADERBOARD_ISSUE_LOOKUP_BATCH = 20;
const GITHUB_ISSUES_PER_PAGE = 100;
const MAX_GITHUB_REQUEST_PAGES = 10;
const ISSUE_BRANCH_PREFIX = "openreactor/issue-";
const APP_JWT_LIFETIME_SECONDS = 9 * 60;
const INSTALLATION_TOKEN_REFRESH_BUFFER_MS = 60_000;
const SUPPORT_REACTION_CONTENT = "+1";
const GITHUB_REACTIONS_PER_PAGE = 100;
const SESSION_COOKIE_NAME = "openreactor_session";
const AUTH_STATE_COOKIE_NAME = "openreactor_auth_state";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const AUTH_STATE_TTL_SECONDS = 10 * 60;
const MAINTAINER_STEERED_LABEL = "maintainer-steered";
const AUTHENTICATED_SUBMITTER_LABEL = "submitter:github-authenticated";

const installationTokenCache = new Map<string, { token: string; expiresAt: number }>();
const installationIdCache = new Map<string, string>();
const signingKeyCache = new Map<string, Promise<CryptoKey>>();
const sessionKeyCache = new Map<string, Promise<CryptoKey>>();

export interface Env {
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_TOKEN?: string;
  GITHUB_LABELS?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_APP_CLIENT_SECRET?: string;
  GITHUB_APP_INSTALLATION_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  SESSION_SECRET?: string;
  OPENREACTOR_STATUS_URL?: string;
  OPENREACTOR_STATUS_TOKEN?: string;
}

interface NormalizedEnv {
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_TOKEN: string;
  GITHUB_LABELS: string;
  GITHUB_APP_ID: string;
  GITHUB_APP_CLIENT_ID: string;
  GITHUB_APP_CLIENT_SECRET: string;
  GITHUB_APP_INSTALLATION_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  SESSION_SECRET: string;
  OPENREACTOR_STATUS_URL: string;
  OPENREACTOR_STATUS_TOKEN: string;
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
  scopePreference?: string;
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
  scopePreference: ScopePreference;
}

type ScopePreference = "auto" | "25" | "50" | "75";

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
  user?: {
    login?: string;
  };
  reactions?: {
    "+1"?: number;
  };
}
interface GitHubIssueComment {
  body?: string;
  updated_at?: string;
}

interface GitHubReaction {
  id: number;
  content?: string;
  user?: {
    login?: string;
  };
}

interface GitHubUser {
  login: string;
  html_url: string;
}

interface GitHubOAuthTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface SupportSession {
  accessToken: string;
  login: string;
  profileUrl: string;
}

interface AuthStatePayload {
  nonce: string;
  returnTo: string;
}

interface GitHubPullRequest {
  number: number;
  html_url: string;
  title: string;
  merged_at?: string | null;
  head?: {
    ref?: string;
  };
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
  creditSource: "pr-author" | "issue-requester";
  mergedCount: number;
  latestMergedAt: string;
  latestPullRequest: {
    number: number;
    title: string;
    url: string;
  };
}

type OpenReactorPipelineStage = {
  key: string;
  label: string;
  available: boolean;
  itemCount: number;
  items: Array<Record<string, unknown>>;
  recentTriage?: Array<Record<string, unknown>>;
  pendingCount?: number;
  source?: string;
  error?: string;
};

type OpenReactorStatusPayload = {
  ok?: boolean;
  available?: boolean;
  generatedAt?: string;
  repo?: Record<string, unknown>;
  services?: Record<string, unknown>;
  agents?: Record<string, unknown>;
  blockers?: Record<string, unknown>;
  pipeline?: {
    version?: number;
    generatedAt?: string;
    stages?: OpenReactorPipelineStage[];
  };
  error?: string;
};

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

export async function handleOpenReactorStatus(env: Env): Promise<Response> {
  const normalized = normalizeEnv(env);
  let localStatus: OpenReactorStatusPayload | null = null;
  let localError = normalized.OPENREACTOR_STATUS_URL
    ? ""
    : "Live OpenReactor status is not configured yet.";

  if (normalized.OPENREACTOR_STATUS_URL) {
    try {
      localStatus = await fetchLocalOpenReactorStatus(normalized);
    } catch (error) {
      console.error("Unable to load live OpenReactor status.", error);
      localError = "Live OpenReactor status is temporarily unavailable.";
    }
  }

  let intakeStage = buildIntakeStage([], {
    available: false,
    error: isRepoConfigured(normalized)
      ? "Repository-backed intake metadata is temporarily unavailable."
      : "Repository-backed intake metadata is not configured yet."
  });

  if (isRepoConfigured(normalized)) {
    try {
      const issues = await listRequestIssues(normalized);
      intakeStage = buildIntakeStage(issues);
    } catch (error) {
      console.error("Unable to load intake-stage request metadata.", error);
    }
  }

  return jsonResponse(
    mergeOpenReactorStatusPayload(localStatus, intakeStage, localError || localStatus?.error || "")
  );
}

async function fetchLocalOpenReactorStatus(env: NormalizedEnv): Promise<OpenReactorStatusPayload> {
  const headers = new Headers({
    Accept: "application/json"
  });
  if (env.OPENREACTOR_STATUS_TOKEN) {
    headers.set("Authorization", `Bearer ${env.OPENREACTOR_STATUS_TOKEN}`);
  }

  const response = await fetch(env.OPENREACTOR_STATUS_URL, {
    headers,
    cf: { cacheTtl: 0, cacheEverything: false }
  } as RequestInit & {
    cf: {
      cacheTtl: number;
      cacheEverything: boolean;
    };
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as OpenReactorStatusPayload) : {};

  if (!response.ok) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "Live OpenReactor status is temporarily unavailable."
    );
  }

  return data;
}

export function mergeOpenReactorStatusPayload(
  localStatus: OpenReactorStatusPayload | null,
  intakeStage: OpenReactorPipelineStage,
  localError = ""
): Record<string, unknown> {
  const fallbackPipeline = buildFallbackPipeline({ intakeStage });
  const localPipelineStages = Array.isArray(localStatus?.pipeline?.stages) ? localStatus.pipeline?.stages : [];

  return {
    ok: localStatus?.ok ?? true,
    available: Boolean(localStatus?.available),
    generatedAt: localStatus?.generatedAt ?? new Date().toISOString(),
    repo: localStatus?.repo ?? null,
    services: localStatus?.services ?? {
      reactor: null,
      watchdog: null
    },
    agents: localStatus?.agents ?? {
      activeCount: 0,
      pendingRetryCount: 0,
      maxConcurrentIssues: 0,
      items: []
    },
    blockers: localStatus?.blockers ?? {
      pausedCount: 0,
      pausedIssues: [],
      maintainerHandoffCount: 0,
      maintainerHandoffs: []
    },
    pipeline: {
      version: Number(localStatus?.pipeline?.version ?? 1),
      generatedAt: localStatus?.pipeline?.generatedAt ?? localStatus?.generatedAt ?? new Date().toISOString(),
      stages: [intakeStage, ...(localPipelineStages.length ? localPipelineStages : fallbackPipeline.stages.slice(1))]
    },
    ...(localError ? { error: localError } : {})
  };
}

export function buildIntakeStage(
  issues: GitHubIssue[],
  input?: {
    available?: boolean;
    error?: string;
  }
): OpenReactorPipelineStage {
  const queuedIssues = issues.filter((issue) => getIssueStatus(issue) === "queued");
  const items = queuedIssues.slice(0, MAX_ARCHIVE_ITEMS).map((issue) => ({
    lane: "intake",
    issueNumber: issue.number,
    issueTitle: issue.title.replace(/^\[Request\]\s*/, ""),
    issueUrl: issue.html_url,
    createdAt: issue.created_at,
    status: "queued",
    supportCount: issue.reactions?.["+1"] ?? 0,
    commentCount: issue.comments ?? 0,
    githubUsername: getIssueGitHubUsername(issue)
  }));

  return {
    key: "intake",
    label: "Intake",
    available: input?.available ?? true,
    itemCount: queuedIssues.length,
    items,
    source: "github",
    ...(input?.error ? { error: input.error } : {})
  };
}

function buildFallbackPipeline(input: { intakeStage: OpenReactorPipelineStage }): {
  version: number;
  generatedAt: string;
  stages: OpenReactorPipelineStage[];
} {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    stages: [
      input.intakeStage,
      buildUnavailableStage("triage-planning", "Triage & planning"),
      buildUnavailableStage("execution", "Execution"),
      buildUnavailableStage("retry", "Retry"),
      buildUnavailableStage("blocked", "Blocked"),
      buildUnavailableStage("completed", "Completed")
    ]
  };
}

function buildUnavailableStage(key: string, label: string): OpenReactorPipelineStage {
  return {
    key,
    label,
    available: false,
    itemCount: 0,
    items: [],
    source: "local-runtime",
    error: "Live OpenReactor runtime metadata is unavailable."
  };
}

export async function handleSession(request: Request, env: Env): Promise<Response> {
  const normalized = normalizeEnv(env);
  const session = await readSupportSession(request, normalized);

  return jsonResponse({
    authAvailable: hasGitHubUserAuth(normalized),
    authenticated: Boolean(session),
    login: session?.login ?? null,
    profileUrl: session?.profileUrl ?? null
  });
}

export async function handleSessionDelete(_request: Request, _env: Env): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": clearCookie(SESSION_COOKIE_NAME),
      ...corsHeaders()
    }
  });
}

export async function handleGitHubAuthStart(request: Request, env: Env): Promise<Response> {
  const normalized = normalizeEnv(env);

  if (!hasGitHubUserAuth(normalized)) {
    return jsonResponse(
      { error: "GitHub sign-in is not configured yet for support actions." },
      503
    );
  }

  const requestUrl = new URL(request.url);
  const returnTo = sanitizeReturnTo(requestUrl.searchParams.get("returnTo"));
  const state: AuthStatePayload = {
    nonce: createNonce(),
    returnTo
  };
  const sealedState = await sealSessionValue(normalized, state);
  const callbackUrl = new URL("/api/auth/callback", requestUrl);
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", normalized.GITHUB_APP_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", callbackUrl.toString());
  authorizeUrl.searchParams.set("scope", "public_repo read:user");
  authorizeUrl.searchParams.set("state", state.nonce);

  return redirectResponse(
    authorizeUrl.toString(),
    [
      serializeCookie(AUTH_STATE_COOKIE_NAME, sealedState, {
        maxAge: AUTH_STATE_TTL_SECONDS
      })
    ],
    302
  );
}

export async function handleGitHubAuthCallback(request: Request, env: Env): Promise<Response> {
  const normalized = normalizeEnv(env);
  const requestUrl = new URL(request.url);

  if (!hasGitHubUserAuth(normalized)) {
    return redirectResponse("/?support=auth-unavailable");
  }

  const stateParam = requestUrl.searchParams.get("state") ?? "";
  const code = requestUrl.searchParams.get("code") ?? "";
  const authState = await readSealedCookie<AuthStatePayload>(request, normalized, AUTH_STATE_COOKIE_NAME);
  const returnTo = sanitizeReturnTo(authState?.returnTo);

  if (!code || !authState || !stateParam || authState.nonce !== stateParam) {
    return redirectResponse(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}support=auth-error`,
      [clearCookie(AUTH_STATE_COOKIE_NAME)]
    );
  }

  try {
    const accessToken = await exchangeGitHubUserCode(
      normalized,
      code,
      new URL("/api/auth/callback", requestUrl).toString()
    );
    const user = await githubUserRequest<GitHubUser>(accessToken, "/user");
    const session: SupportSession = {
      accessToken,
      login: user.login,
      profileUrl: user.html_url
    };

    return redirectResponse(`${returnTo}${returnTo.includes("?") ? "&" : "?"}support=connected`, [
      serializeCookie(SESSION_COOKIE_NAME, await sealSessionValue(normalized, session), {
        maxAge: SESSION_TTL_SECONDS
      }),
      clearCookie(AUTH_STATE_COOKIE_NAME)
    ]);
  } catch (error) {
    console.error("GitHub sign-in failed.", error);
    return redirectResponse(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}support=auth-error`,
      [clearCookie(AUTH_STATE_COOKIE_NAME)]
    );
  }
}

export async function handleCreateSupport(request: Request, env: Env): Promise<Response> {
  const normalized = normalizeEnv(env);

  if (!isRepoConfigured(normalized)) {
    return jsonResponse({ error: "Support is not configured yet." }, 503);
  }

  const session = await readSupportSession(request, normalized);
  if (!session) {
    return jsonResponse({ error: "Sign in with GitHub to support issues from the website." }, 401);
  }

  let issueNumber = 0;
  try {
    const payload = (await request.json()) as { issueNumber?: number };
    issueNumber = Number(payload.issueNumber);
  } catch {
    return jsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    return jsonResponse({ error: "Issue number must be a positive integer." }, 400);
  }

  try {
    await createIssueSupportReaction(normalized, session.accessToken, issueNumber);
    const issue = await githubUserRequest<GitHubIssue>(
      session.accessToken,
      `/repos/${normalized.GITHUB_OWNER}/${normalized.GITHUB_REPO}/issues/${issueNumber}`
    );

    return jsonResponse({
      issueNumber,
      supportCount: issue.reactions?.["+1"] ?? 0,
      viewerSupports: true
    });
  } catch (error) {
    if (isGithubAuthError(error)) {
      return jsonResponse(
        { error: "GitHub sign-in expired. Sign in again to support this issue." },
        401,
        {
          "Set-Cookie": clearCookie(SESSION_COOKIE_NAME)
        }
      );
    }

    return errorResponse("Unable to record support on GitHub.", 502, error);
  }
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
    const session = await readSupportSession(request, normalized);
    const archivePage = getQueuePage(request);
    const trackedIssueNumbers = getTrackedIssueNumbers(request);
    const issues = await listRequestIssues(normalized);
    const activeIssues = issues.filter((issue) => !isArchivedIssue(issue));
    const archivedIssues = issues.filter((issue) => isArchivedIssue(issue));
    const start = (archivePage - 1) * MAX_ARCHIVE_ITEMS;
    const visibleArchivedIssues = archivedIssues.slice(start, start + MAX_ARCHIVE_ITEMS);
    const visibleIssueNumbers = new Set(
      activeIssues.concat(visibleArchivedIssues).map((issue) => issue.number)
    );
    const trackedIssues = issues.filter(
      (issue) => trackedIssueNumbers.includes(issue.number) && !visibleIssueNumbers.has(issue.number)
    );
    const [activeItems, archivedItems] = await Promise.all([
      Promise.all(activeIssues.map((issue) => mapQueueIssue(normalized, issue, session))),
      Promise.all(visibleArchivedIssues.map((issue) => mapQueueIssue(normalized, issue, session)))
    ]);
    const trackedItems = await Promise.all(trackedIssues.map((issue) => mapQueueIssue(normalized, issue, session)));

    const repoUrl = getRepoUrl(normalized);
    const archiveHasPreviousPage = archivePage > 1;
    const archiveHasNextPage = archivedIssues.length > start + MAX_ARCHIVE_ITEMS;
    const archiveTotal = archivedIssues.length;
    const items = [...activeItems, ...archivedItems, ...trackedItems];
    const etag = buildQueueEtag({
      items,
      page: archivePage,
      hasPreviousPage: archiveHasPreviousPage,
      hasNextPage: archiveHasNextPage,
      totalItems: archiveTotal,
      trackedIssueNumbers
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
        trackedItems,
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
    const issueUsernames = await getLeaderboardIssueUsernames(normalized, pullRequests);
    const leaderboard = buildLeaderboard(pullRequests, issueUsernames);

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

  const session = await readSupportSession(request, normalized);
  const trustedLabels = getTrustedSubmissionLabels(normalized, session);
  const attributedRequest: ValidatedFeatureRequest = {
    ...validated,
    githubUsername: session?.login ?? ""
  };

  const fallbackUrl = buildIssueCreateUrl(normalized, attributedRequest, request);
  const labels = await getExistingLabels(normalized, trustedLabels);
  const body = buildIssueBody(attributedRequest, request, {
    authenticatedGithubLogin: session?.login ?? null
  });

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
          title: `[Request] ${attributedRequest.summary}`,
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
  const scopePreference = normalizeScopePreference(input.scopePreference);

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

  if (!scopePreference) {
    return {
      error: "Scope must be Auto, 25, 50, or 75."
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
    notes,
    scopePreference
  };
}

function buildIssueBody(
  input: ValidatedFeatureRequest,
  request: Request,
  options: { authenticatedGithubLogin?: string | null } = {}
): string {
  const url = new URL(request.url);
  const submittedAt = new Date().toISOString();
  const origin = `${url.protocol}//${url.host}`;
  const desiredScope = describeScopePreference(input.scopePreference);
  const submittedBy = input.name || (input.githubUsername ? `GitHub @${input.githubUsername}` : "_Anonymous_");
  const submissionIdentity = options.authenticatedGithubLogin
    ? `Authenticated GitHub session (@${options.authenticatedGithubLogin})`
    : "Unauthenticated / anonymous";

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
    "## Desired Scope",
    desiredScope,
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
    submittedBy,
    "",
    "## GitHub Username",
    input.githubUsername ? `@${input.githubUsername}` : "_Not provided_",
    "",
    "## Submission Identity",
    submissionIdentity,
    "",
    "## Contact",
    input.contact || "_Not provided_",
    "",
    "## Intake Metadata",
    `- Submitted at: ${submittedAt}`,
    `- Origin: ${origin}`
  ].join("\n");
}

function normalizeScopePreference(value: string | undefined): ScopePreference | null {
  if (value === undefined || value === "") {
    return "auto";
  }

  return value === "auto" || value === "25" || value === "50" || value === "75" ? value : null;
}

function describeScopePreference(value: ScopePreference): string {
  if (value === "auto") {
    return "Auto — Let the issue agent decide the amount of scope.";
  }

  const labels: Record<Exclude<ScopePreference, "auto">, string> = {
    "25": "Minimal change",
    "50": "Moderate change",
    "75": "Significant change"
  };

  return `${value} / 100 — ${labels[value]}`;
}

function getTrustedSubmissionLabels(
  env: NormalizedEnv,
  session: SupportSession | null
): string[] {
  if (!session?.login) {
    return [];
  }

  const labels = [AUTHENTICATED_SUBMITTER_LABEL];
  if (session.login.toLowerCase() === env.GITHUB_OWNER.toLowerCase()) {
    labels.push(MAINTAINER_STEERED_LABEL);
  }

  return labels;
}

async function getExistingLabels(env: Env, extraLabels: string[] = []): Promise<string[]> {
  const normalized = normalizeEnv(env);
  const configuredLabels = normalized.GITHUB_LABELS
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const requestedLabels = Array.from(new Set([...configuredLabels, ...extraLabels]));

  if (!requestedLabels.length || !isRepoConfigured(normalized)) {
    return [];
  }

  try {
    const labels = await githubRequestWithFallback<Array<{ name?: string }>>(
      normalized,
      `/repos/${normalized.GITHUB_OWNER}/${normalized.GITHUB_REPO}/labels?per_page=100`
    );

    const available = new Set(labels.map((label) => label.name).filter(Boolean));
    return requestedLabels.filter((label) => available.has(label));
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

function buildLeaderboard(
  pullRequests: GitHubPullRequest[],
  issueUsernames: Map<number, string>
): {
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
    const issueNumber = parseIssueNumberFromBranch(pullRequest.head?.ref);
    const issueUsername = issueNumber !== null ? issueUsernames.get(issueNumber) ?? null : null;
    const login = issueUsername || pullRequest.user?.login?.trim();
    const profileUrl = issueUsername
      ? `https://github.com/${issueUsername}`
      : pullRequest.user?.html_url?.trim();
    const mergedAt = pullRequest.merged_at ?? "";
    const creditSource = issueUsername ? "issue-requester" : "pr-author";
    const accountType = issueUsername ? "Requester" : pullRequest.user?.type ?? "User";

    if (!login || !profileUrl || !mergedAt) {
      continue;
    }

    const current = contributors.get(login);

    if (!current) {
      contributors.set(login, {
        login,
        profileUrl,
        accountType,
        creditSource,
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

async function getLeaderboardIssueUsernames(
  env: Env,
  pullRequests: GitHubPullRequest[]
): Promise<Map<number, string>> {
  const issueNumbers = new Set<number>();

  for (const pullRequest of pullRequests) {
    const issueNumber = parseIssueNumberFromBranch(pullRequest.head?.ref);
    if (issueNumber !== null) {
      issueNumbers.add(issueNumber);
    }
  }

  const issueNumberList = [...issueNumbers];
  const entries: Array<readonly [number, string | null]> = [];

  for (let index = 0; index < issueNumberList.length; index += MAX_LEADERBOARD_ISSUE_LOOKUP_BATCH) {
    const batch = issueNumberList.slice(index, index + MAX_LEADERBOARD_ISSUE_LOOKUP_BATCH);
    const batchEntries = await Promise.all(
      batch.map(async (issueNumber) => {
        try {
          const issue = await githubRequestWithFallback<GitHubIssue>(
            env,
            `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/${issueNumber}`
          );
          return [issueNumber, getIssueGitHubUsername(issue)] as const;
        } catch {
          return [issueNumber, null] as const;
        }
      })
    );

    entries.push(...batchEntries);
  }

  return new Map(entries.filter((entry): entry is readonly [number, string] => Boolean(entry[1])));
}

function parseIssueNumberFromBranch(branchName?: string): number | null {
  const normalized = clean(branchName);
  if (!normalized.startsWith(ISSUE_BRANCH_PREFIX)) {
    return null;
  }

  const issueNumber = Number.parseInt(normalized.slice(ISSUE_BRANCH_PREFIX.length), 10);
  return Number.isInteger(issueNumber) && issueNumber > 0 ? issueNumber : null;
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
  const authorLogin = normalizeGitHubUsername(issue.user?.login);
  if (authorLogin && !/\[bot\]$/i.test(authorLogin)) {
    return authorLogin;
  }

  if (
    !issueHasLabel(issue, AUTHENTICATED_SUBMITTER_LABEL) &&
    !issueHasLabel(issue, MAINTAINER_STEERED_LABEL)
  ) {
    return null;
  }

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

function issueHasLabel(issue: Pick<GitHubIssue, "labels">, labelName: string): boolean {
  return (issue.labels ?? []).some(
    (label) => (label.name ?? "").toLowerCase() === labelName.toLowerCase()
  );
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

async function mapQueueIssue(env: NormalizedEnv, issue: GitHubIssue, session?: SupportSession | null) {
  const [statusUpdate, viewerSupports] = await Promise.all([
    getIssueStatusUpdate(env, issue.number),
    session
      ? getViewerSupportState(env, issue.number, session.login, session.accessToken).catch(() => false)
      : Promise.resolve(false)
  ]);

  return {
    number: issue.number,
    title: issue.title.replace(/^\[Request\]\s*/, ""),
    url: issue.html_url,
    commentUrl: issue.html_url,
    commentCount: issue.comments ?? 0,
    createdAt: issue.created_at,
    status: getIssueStatus(issue),
    githubUsername: getIssueGitHubUsername(issue),
    supportCount: issue.reactions?.["+1"] ?? 0,
    viewerSupports,
    statusDetail: statusUpdate?.detail ?? null,
    statusUpdatedAt: statusUpdate?.updatedAt ?? null
  };
}

async function getViewerSupportState(
  env: NormalizedEnv,
  issueNumber: number,
  viewerLogin: string,
  accessToken: string
): Promise<boolean> {
  const normalizedViewerLogin = clean(viewerLogin).toLowerCase();

  if (!normalizedViewerLogin) {
    return false;
  }

  for (let page = 1; page <= MAX_GITHUB_REQUEST_PAGES; page += 1) {
    const reactions = await githubUserRequest<GitHubReaction[]>(
      accessToken,
      `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/${issueNumber}/reactions?per_page=${GITHUB_REACTIONS_PER_PAGE}&page=${page}`
    );

    if (
      reactions.some(
        (reaction) =>
          reaction.content === SUPPORT_REACTION_CONTENT &&
          clean(reaction.user?.login).toLowerCase() === normalizedViewerLogin
      )
    ) {
      return true;
    }

    if (reactions.length < GITHUB_REACTIONS_PER_PAGE) {
      return false;
    }
  }

  return false;
}

async function createIssueSupportReaction(
  env: NormalizedEnv,
  accessToken: string,
  issueNumber: number
): Promise<void> {
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": GITHUB_USER_AGENT,
    "X-GitHub-Api-Version": GITHUB_API_VERSION
  });

  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/${issueNumber}/reactions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ content: SUPPORT_REACTION_CONTENT })
    }
  );

  if (response.status === 200 || response.status === 201) {
    return;
  }

  const detail = await safeErrorDetail(response);
  throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`);
}

function getQueuePage(request: Request): number {
  const value = new URL(request.url).searchParams.get("page");
  const page = Number.parseInt(value ?? "1", 10);

  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }

  return page;
}

function getTrackedIssueNumbers(request: Request): number[] {
  const value = new URL(request.url).searchParams.get("tracked");

  if (!value) {
    return [];
  }

  const numbers = value
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((entry, index, all) => Number.isInteger(entry) && entry > 0 && all.indexOf(entry) === index);

  return numbers.slice(0, MAX_TRACKED_REQUESTS);
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

function redirectResponse(location: string, cookies: string[] = [], status = 303): Response {
  const headers = new Headers({ Location: location });

  for (const cookie of cookies) {
    headers.append("Set-Cookie", cookie);
  }

  return new Response(null, {
    status,
    headers
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
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
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

function clean(value?: string | null): string {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

function sanitizeReturnTo(value?: string | null): string {
  const cleaned = clean(value);

  if (!cleaned.startsWith("/") || cleaned.startsWith("//")) {
    return "/";
  }

  return cleaned;
}

function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return toBase64Url(bytes);
}

function parseCookieHeader(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();

  for (const part of (header ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");

    if (!name || !rest.length) {
      continue;
    }

    cookies.set(name, decodeURIComponent(rest.join("=")));
  }

  return cookies;
}

function serializeCookie(
  name: string,
  value: string,
  options: { maxAge?: number; path?: string } = {}
): string {
  const path = options.path ?? "/";
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, "HttpOnly", "SameSite=Lax"];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  return parts.join("; ");
}

function clearCookie(name: string): string {
  return serializeCookie(name, "", { maxAge: 0 });
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
  totalItems,
  trackedIssueNumbers
}: {
  items: Array<{
    number: number;
    createdAt: string;
    status: string;
    commentCount?: number;
    githubUsername?: string | null;
    supportCount?: number;
    viewerSupports?: boolean;
    statusDetail?: string | null;
    statusUpdatedAt?: string | null;
  }>;
  page: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  totalItems: number;
  trackedIssueNumbers?: number[];
}): string {
  const signature = items
    .map(
      (item) =>
        `${item.number}:${item.status}:${item.createdAt}:${item.commentCount ?? 0}:${item.githubUsername ?? ""}:${item.supportCount ?? 0}:${item.viewerSupports ? 1 : 0}:${item.statusUpdatedAt ?? ""}:${item.statusDetail ?? ""}`
    )
    .join("|");
  const trackedState = (trackedIssueNumbers ?? []).join(",");
  const pageState = `${page}:${hasPreviousPage ? 1 : 0}:${hasNextPage ? 1 : 0}:${totalItems}:${trackedState}`;
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
    GITHUB_APP_CLIENT_SECRET: clean(env.GITHUB_APP_CLIENT_SECRET),
    GITHUB_APP_INSTALLATION_ID: clean(env.GITHUB_APP_INSTALLATION_ID),
    GITHUB_APP_PRIVATE_KEY: cleanPrivateKey(env.GITHUB_APP_PRIVATE_KEY),
    SESSION_SECRET: clean(env.SESSION_SECRET),
    OPENREACTOR_STATUS_URL: clean(env.OPENREACTOR_STATUS_URL),
    OPENREACTOR_STATUS_TOKEN: clean(env.OPENREACTOR_STATUS_TOKEN)
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

function hasGitHubUserAuth(env: Env): boolean {
  const normalized = normalizeEnv(env);
  return Boolean(
    normalized.GITHUB_APP_CLIENT_ID &&
      normalized.GITHUB_APP_CLIENT_SECRET &&
      normalized.SESSION_SECRET &&
      isRepoConfigured(normalized)
  );
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

async function githubUserRequest<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${accessToken}`);
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

async function exchangeGitHubUserCode(
  env: NormalizedEnv,
  code: string,
  redirectUri: string
): Promise<string> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": GITHUB_USER_AGENT
    },
    body: JSON.stringify({
      client_id: env.GITHUB_APP_CLIENT_ID,
      client_secret: env.GITHUB_APP_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri
    })
  });

  const data = (await response.json()) as GitHubOAuthTokenResponse;

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "GitHub OAuth exchange failed.");
  }

  return data.access_token;
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

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return new Uint8Array(Buffer.from(`${padded}${padding}`, "base64"));
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

async function getSessionKey(secret: string): Promise<CryptoKey> {
  const cached = sessionKeyCache.get(secret);
  if (cached) {
    return cached;
  }

  const imported = (async () => {
    const hashed = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    return crypto.subtle.importKey("raw", hashed, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  })();

  sessionKeyCache.set(secret, imported);
  return imported;
}

async function sealSessionValue<T extends object>(env: NormalizedEnv, value: T): Promise<string> {
  const key = await getSessionKey(env.SESSION_SECRET);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, plaintext);

  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

async function unsealSessionValue<T>(env: NormalizedEnv, value: string): Promise<T | null> {
  if (!env.SESSION_SECRET || !value.includes(".")) {
    return null;
  }

  const [ivValue, ciphertextValue] = value.split(".", 2);

  try {
    const key = await getSessionKey(env.SESSION_SECRET);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(fromBase64Url(ivValue)) },
      key,
      toArrayBuffer(fromBase64Url(ciphertextValue))
    );
    return JSON.parse(Buffer.from(plaintext).toString("utf8")) as T;
  } catch {
    return null;
  }
}

async function readSealedCookie<T>(
  request: Request,
  env: NormalizedEnv,
  cookieName: string
): Promise<T | null> {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const value = cookies.get(cookieName);

  if (!value) {
    return null;
  }

  return unsealSessionValue<T>(env, value);
}

async function readSupportSession(
  request: Request,
  env: NormalizedEnv
): Promise<SupportSession | null> {
  const session = await readSealedCookie<SupportSession>(request, env, SESSION_COOKIE_NAME);

  if (!session?.accessToken || !session.login || !session.profileUrl) {
    return null;
  }

  return session;
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
