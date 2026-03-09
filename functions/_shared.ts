const REQUEST_MARKER = "<!-- openreactor:feature-request -->";
const GITHUB_API_VERSION = "2022-11-28";
const MAX_QUEUE_ITEMS = 12;

export interface Env {
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_TOKEN?: string;
  GITHUB_LABELS?: string;
}

interface NormalizedEnv {
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_TOKEN: string;
  GITHUB_LABELS: string;
}

interface FeatureRequestInput {
  name?: string;
  contact?: string;
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
  created_at: string;
  pull_request?: Record<string, unknown>;
  labels?: Array<{ name?: string }>;
}

export async function handleMeta(env: Env): Promise<Response> {
  return jsonResponse({
    configured: isRepoConfigured(env),
    repoUrl: getRepoUrl(env)
  });
}

export async function handleHealth(env: Env): Promise<Response> {
  return jsonResponse({
    ok: true,
    repoConfigured: isRepoConfigured(env),
    submissionConfigured: isSubmissionConfigured(env)
  });
}

export async function handleListRequests(env: Env): Promise<Response> {
  const normalized = normalizeEnv(env);

  if (!isRepoConfigured(normalized)) {
    return jsonResponse({ items: [], repoUrl: null });
  }

  try {
    const issues = await githubRequest<GitHubIssue[]>(
      normalized,
      `/repos/${normalized.GITHUB_OWNER}/${normalized.GITHUB_REPO}/issues?state=open&sort=created&direction=desc&per_page=30`
    );

    const items = issues
      .filter((issue) => !issue.pull_request)
      .filter((issue) => (issue.body ?? "").includes(REQUEST_MARKER) || issue.title.startsWith("[Request] "))
      .slice(0, MAX_QUEUE_ITEMS)
      .map((issue) => ({
        number: issue.number,
        title: issue.title.replace(/^\[Request\]\s*/, ""),
        url: issue.html_url,
        createdAt: issue.created_at,
        status: getIssueStatus(issue)
      }));

    return jsonResponse({
      items,
      repoUrl: getRepoUrl(normalized)
    });
  } catch (error) {
    return errorResponse("Unable to load the request queue.", 502, error);
  }
}

export async function handleCreateRequest(request: Request, env: Env): Promise<Response> {
  const normalized = normalizeEnv(env);

  if (!isSubmissionConfigured(normalized)) {
    return jsonResponse(
      { error: "Submissions are not configured yet. Add GitHub repository settings and a token." },
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

  const labels = await getExistingLabels(env);
  const body = buildIssueBody(validated, request);

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
        number: issue.number,
        url: issue.html_url
      },
      201
    );
  } catch (error) {
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

  return {
    name,
    contact,
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

  if (!configuredLabels.length || !normalized.GITHUB_TOKEN || !isRepoConfigured(normalized)) {
    return [];
  }

  try {
    const labels = await githubRequest<Array<{ name?: string }>>(
      normalized,
      `/repos/${normalized.GITHUB_OWNER}/${normalized.GITHUB_REPO}/labels?per_page=100`
    );

    const available = new Set(labels.map((label) => label.name).filter(Boolean));
    return configuredLabels.filter((label) => available.has(label));
  } catch {
    return [];
  }
}

async function githubRequest<T>(env: Env, path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", GITHUB_API_VERSION);

  if (env.GITHUB_TOKEN) {
    headers.set("Authorization", `Bearer ${env.GITHUB_TOKEN}`);
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

function getIssueStatus(issue: GitHubIssue): string {
  const labelNames = new Set((issue.labels ?? []).map((label) => (label.name ?? "").toLowerCase()));

  if (labelNames.has("accepted")) {
    return "accepted";
  }

  if (labelNames.has("needs-refinement") || labelNames.has("needs refinement")) {
    return "needs-refinement";
  }

  if (labelNames.has("rejected")) {
    return "rejected";
  }

  return "submitted";
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
  const normalized = normalizeEnv(env);
  return Boolean(normalized.GITHUB_OWNER && normalized.GITHUB_REPO && normalized.GITHUB_TOKEN);
}

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders()
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

function clean(value?: string): string {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

function normalizeEnv(env: Env): NormalizedEnv {
  return {
    GITHUB_OWNER: clean(env.GITHUB_OWNER),
    GITHUB_REPO: clean(env.GITHUB_REPO),
    GITHUB_TOKEN: clean(env.GITHUB_TOKEN).replace(/\s+/g, ""),
    GITHUB_LABELS: clean(env.GITHUB_LABELS)
  };
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
