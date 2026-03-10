const form = document.querySelector("#request-form");
const statusNode = document.querySelector("#form-status");
const requestField = document.querySelector("#request");
const submitButton = document.querySelector("#submit-button");
const requestCountNode = document.querySelector("#request-count");
const repoStarLink = document.querySelector("#repo-star-link");
const queueList = document.querySelector("#queue-list");
const queueStatusNode = document.querySelector("#queue-status");
const queueRefreshNoteNode = document.querySelector("#queue-refresh-note");
const queueRepoLink = document.querySelector("#queue-repo-link");

const SUBMIT_BUTTON_LABEL = "Submit";
const QUEUE_POLL_INTERVAL_MS = 30_000;

let queueEtag = "";
let lastQueueRefreshAt = 0;
let queuePollTimer = 0;

boot();

async function boot() {
  form.addEventListener("submit", onSubmit);
  requestField.addEventListener("input", onRequestInput);
  document.addEventListener("visibilitychange", onVisibilityChange);
  updateRequestCount(requestField.value);
  await Promise.all([loadRepoMeta(), loadQueue()]);
  startQueuePolling();
}

function onRequestInput(event) {
  updateRequestCount(event.currentTarget.value);
}

async function onSubmit(event) {
  event.preventDefault();

  setStatus("");
  submitButton.disabled = true;
  submitButton.textContent = "Sending...";

  const formData = new FormData(form);
  const request = `${formData.get("request") ?? ""}`.trim();
  const githubUsername = `${formData.get("githubUsername") ?? ""}`.trim();
  const website = `${formData.get("website") ?? ""}`;
  const validationError = validateRequest(request, githubUsername);

  if (validationError) {
    setStatus(validationError, "error");
    submitButton.disabled = false;
    submitButton.textContent = SUBMIT_BUTTON_LABEL;
    return;
  }

  const payload = buildPayload(request, website, githubUsername);

  try {
    const response = await fetch("/api/requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await readJsonResponse(response, "submission");

    if (!response.ok) {
      throw new Error(data.error || "Submission failed.");
    }

    if (data.mode === "github_redirect" && data.url) {
      setStatus("Redirecting to GitHub...", "success");
      window.location.assign(data.url);
      return;
    }

    form.reset();
    updateRequestCount("");
    setStatus(`Request queued as issue #${data.number}.`, "success");
    requestField.focus();
    await loadQueue();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Submission failed.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = SUBMIT_BUTTON_LABEL;
  }
}

function buildPayload(request, website, githubUsername) {
  const summary = summarizeRequest(request);

  return {
    website,
    githubUsername: normalizeGitHubUsername(githubUsername),
    summary,
    problem: request,
    outcome: `Ship the request described in Summary and Problem.\n\nRequested change:\n${request}`,
    constraints: "",
    successCriteria: "",
    notes: ""
  };
}

function summarizeRequest(request) {
  const normalized = request.replace(/\s+/g, " ").trim();
  const sentence = normalized.split(/[.!?](?:\s|$)/)[0] || normalized;

  if (sentence.length >= 8 && sentence.length <= 120) {
    return sentence;
  }

  if (normalized.length <= 120) {
    return normalized;
  }

  return `${normalized.slice(0, 117).trimEnd()}...`;
}

function validateRequest(request, githubUsername) {
  if (isLowSignalText(request)) {
    return "Describe the request in plain language instead of repeated or placeholder text.";
  }

  const normalizedGitHubUsername = normalizeGitHubUsername(githubUsername);
  if (normalizedGitHubUsername && !isValidGitHubUsername(normalizedGitHubUsername)) {
    return "GitHub username must be 1 to 39 characters using letters, numbers, or single hyphens.";
  }

  return "";
}

function normalizeGitHubUsername(value) {
  return value.replace(/^@+/, "").trim();
}

function isValidGitHubUsername(value) {
  return /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(value);
}

function isLowSignalText(value) {
  const normalized = value.trim().toLowerCase();
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

function updateRequestCount(request) {
  requestCountNode.textContent = `${request.length} / 2000`;
}

function setStatus(message, tone) {
  statusNode.textContent = message;
  statusNode.className = tone ? `status-message ${tone}` : "status-message";
}

async function loadQueue(options = {}) {
  const { silent = false } = options;

  if (!silent) {
    setQueueStatus("Loading queue...");
    setQueueRefreshNote("");
    queueList.innerHTML = "";
  }

  try {
    const headers = queueEtag ? { "If-None-Match": queueEtag } : {};
    const response = await fetch("/api/requests", {
      headers,
      cache: "no-store"
    });

    if (response.status === 304) {
      markQueueRefresh();
      refreshQueueStatusCopy();
      return;
    }

    const data = await readJsonResponse(response, "queue");

    if (!response.ok) {
      throw new Error(data.error || "Unable to load the public queue.");
    }

    queueEtag = response.headers.get("etag") || "";
    renderQueue(data.items || [], data.repoUrl || "");
  } catch (error) {
    queueEtag = "";
    renderQueueError(error instanceof Error ? error.message : "Unable to load the public queue.");
  }
}

async function loadRepoMeta() {
  try {
    const response = await fetch("/api/meta");
    const data = await readJsonResponse(response, "metadata");

    if (!response.ok) {
      throw new Error(data.error || "Unable to load repository metadata.");
    }

    renderRepoStarLink(data.repoUrl || "");
  } catch {
    renderRepoStarLink("");
  }
}

function renderRepoStarLink(repoUrl) {
  if (repoUrl) {
    repoStarLink.href = repoUrl;
    repoStarLink.hidden = false;
    return;
  }

  repoStarLink.hidden = true;
  repoStarLink.removeAttribute("href");
}

function renderQueue(items, repoUrl) {
  markQueueRefresh();
  queueList.innerHTML = "";

  if (repoUrl) {
    renderRepoStarLink(repoUrl);
    queueRepoLink.href = repoUrl;
    queueRepoLink.hidden = false;
  } else {
    queueRepoLink.hidden = true;
    queueRepoLink.removeAttribute("href");
  }

  if (!items.length) {
    setQueueStatus(`No requests yet. Auto-refreshes every ${formatPollInterval()}.`);
    setQueueRefreshNote(`Last checked ${formatRelativeRefreshTime(lastQueueRefreshAt)}.`);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const item of items) {
    const row = document.createElement("li");
    row.className = "queue-item";

    const link = document.createElement("a");
    link.className = "queue-item-link";
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noreferrer";

    const top = document.createElement("div");
    top.className = "queue-item-top";

    const issue = document.createElement("span");
    issue.className = "queue-item-issue";
    issue.textContent = `Issue #${item.number}`;

    const status = document.createElement("span");
    status.className = "queue-item-status";
    status.dataset.status = item.status;
    status.textContent = formatStatus(item.status);

    top.append(issue, status);

    const title = document.createElement("span");
    title.className = "queue-item-title";
    title.textContent = item.title;

    const meta = document.createElement("time");
    meta.className = "queue-item-meta";
    meta.dateTime = item.createdAt;
    meta.title = item.createdAt;
    meta.textContent = formatSubmissionTimestamp(item.createdAt);

    const detail = document.createElement("p");
    detail.className = "queue-item-detail";
    detail.textContent = formatQueueDetail(item.statusDetail, item.statusUpdatedAt);
    detail.hidden = !detail.textContent;

    const cta = document.createElement("span");
    cta.className = "queue-item-cta";
    cta.textContent = "Open on GitHub";

    link.append(top, title, meta, detail, cta);
    row.append(link);
    fragment.append(row);
  }

  queueList.append(fragment);
  refreshQueueStatusCopy(items.length);
}

function renderQueueError(message) {
  queueList.innerHTML = "";
  queueRepoLink.hidden = true;
  queueRepoLink.removeAttribute("href");
  setQueueStatus(`${message} See GitHub directly if needed.`, "error");
  setQueueRefreshNote(`Auto-refresh retries every ${formatPollInterval()}.`);
}

function setQueueStatus(message, tone) {
  queueStatusNode.textContent = message;
  queueStatusNode.className = tone ? `queue-status ${tone}` : "queue-status";
}

function setQueueRefreshNote(message) {
  queueRefreshNoteNode.textContent = message;
}

function startQueuePolling() {
  stopQueuePolling();
  queuePollTimer = window.setInterval(() => {
    if (document.visibilityState !== "visible") {
      return;
    }

    loadQueue({ silent: true });
  }, QUEUE_POLL_INTERVAL_MS);
}

function stopQueuePolling() {
  if (!queuePollTimer) {
    return;
  }

  window.clearInterval(queuePollTimer);
  queuePollTimer = 0;
}

function onVisibilityChange() {
  if (document.visibilityState !== "visible") {
    return;
  }

  if (Date.now() - lastQueueRefreshAt >= QUEUE_POLL_INTERVAL_MS) {
    loadQueue({ silent: true });
  }
}

function refreshQueueStatusCopy(itemCount = queueList.childElementCount) {
  const countLabel = `${itemCount} request${itemCount === 1 ? "" : "s"}.`;
  const freshnessLabel = lastQueueRefreshAt
    ? `Last checked ${formatRelativeRefreshTime(lastQueueRefreshAt)}.`
    : "Waiting for the first refresh.";
  setQueueStatus(`${countLabel} Auto-refreshes every ${formatPollInterval()}.`);
  setQueueRefreshNote(freshnessLabel);
}

function markQueueRefresh() {
  lastQueueRefreshAt = Date.now();
}

function formatPollInterval() {
  return `${Math.round(QUEUE_POLL_INTERVAL_MS / 1000)}s`;
}

function formatRelativeRefreshTime(timestamp) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));

  if (seconds <= 2) {
    return "just now";
  }

  return `${seconds}s ago`;
}

function formatStatus(status) {
  return status.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatSubmissionTimestamp(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Submitted at an unknown time";
  }

  const formatted = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
  const formattedTime = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short"
  }).format(date);

  return `Submitted ${formatted} at ${formattedTime}`;
}

function formatQueueDetail(detail, updatedAt) {
  if (!detail) {
    return "";
  }

  const updatedLabel = updatedAt ? formatStatusTimestamp(updatedAt) : "Updated recently";
  return `${detail} ${updatedLabel}`;
}

function formatStatusTimestamp(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Updated recently.";
  }

  const formatted = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);

  return `Updated ${formatted}.`;
}

async function readJsonResponse(response, context) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const body = await response.text();
  const snippet = body.trim().slice(0, 80);

  if (!response.ok) {
    throw new Error(`The ${context} API returned ${response.status}.`);
  }

  if (snippet.startsWith("<!DOCTYPE") || snippet.startsWith("<html")) {
    throw new Error(`The ${context} API returned HTML instead of JSON.`);
  }

  throw new Error(`The ${context} API returned an unexpected response.`);
}
