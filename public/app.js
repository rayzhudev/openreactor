const form = document.querySelector("#request-form");
const statusNode = document.querySelector("#form-status");
const requestField = document.querySelector("#request");
const submitButton = document.querySelector("#submit-button");
const repoStarLink = document.querySelector("#repo-star-link");
const queueList = document.querySelector("#queue-list");
const queueStatusNode = document.querySelector("#queue-status");
const queueRepoLink = document.querySelector("#queue-repo-link");
const queueTotalNode = document.querySelector("#queue-total");
const queueActiveNode = document.querySelector("#queue-active");
const queueCompleteNode = document.querySelector("#queue-complete");
const queueSummaryNode = document.querySelector("#queue-summary");

const SUBMIT_BUTTON_LABEL = "Launch issue";

boot();

async function boot() {
  resetQueueSummary();
  form.addEventListener("submit", onSubmit);
  await Promise.all([loadRepoMeta(), loadQueue()]);
}

async function onSubmit(event) {
  event.preventDefault();

  setStatus("");
  submitButton.disabled = true;
  submitButton.textContent = "Sending...";

  const formData = new FormData(form);
  const request = `${formData.get("request") ?? ""}`.trim();
  const website = `${formData.get("website") ?? ""}`;
  const payload = buildPayload(request, website);

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
      setStatus("Redirecting to GitHub to complete the issue submission...", "success");
      window.location.assign(data.url);
      return;
    }

    form.reset();
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

function buildPayload(request, website) {
  const summary = summarizeRequest(request);

  return {
    website,
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

function setStatus(message, tone) {
  statusNode.textContent = message;
  statusNode.className = tone ? `status-message ${tone}` : "status-message";
}

async function loadQueue() {
  setQueueStatus("Loading recent requests...");
  queueList.innerHTML = "";

  try {
    const response = await fetch("/api/requests");
    const data = await readJsonResponse(response, "queue");

    if (!response.ok) {
      throw new Error(data.error || "Unable to load the public queue.");
    }

    renderQueue(data.items || [], data.repoUrl || "");
  } catch (error) {
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
  queueList.innerHTML = "";
  updateQueueSummary(items);

  if (repoUrl) {
    renderRepoStarLink(repoUrl);
    queueRepoLink.href = repoUrl;
    queueRepoLink.hidden = false;
  } else {
    queueRepoLink.hidden = true;
    queueRepoLink.removeAttribute("href");
  }

  if (!items.length) {
    setQueueStatus("No public requests yet. New requests will appear here with their latest status.");
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

    const meta = document.createElement("span");
    meta.className = "queue-item-meta";
    meta.textContent = formatDate(item.createdAt);

    const cta = document.createElement("span");
    cta.className = "queue-item-cta";
    cta.textContent = "Open on GitHub";

    link.append(top, title, meta, cta);
    row.append(link);
    fragment.append(row);
  }

  queueList.append(fragment);
  setQueueStatus(`${items.length} public request${items.length === 1 ? "" : "s"} loaded.`);
}

function renderQueueError(message) {
  queueList.innerHTML = "";
  queueRepoLink.hidden = true;
  queueRepoLink.removeAttribute("href");
  setMetric(queueTotalNode, "--");
  setMetric(queueActiveNode, "--");
  setMetric(queueCompleteNode, "--");
  queueSummaryNode.textContent = "Queue unavailable right now.";
  setQueueStatus(`${message} Check GitHub directly if the queue API is unavailable.`, "error");
}

function setQueueStatus(message, tone) {
  queueStatusNode.textContent = message;
  queueStatusNode.className = tone ? `queue-status ${tone}` : "queue-status";
}

function resetQueueSummary() {
  setMetric(queueTotalNode, "--");
  setMetric(queueActiveNode, "--");
  setMetric(queueCompleteNode, "--");
  queueSummaryNode.textContent = "Connecting to GitHub...";
}

function updateQueueSummary(items) {
  const activeCount = items.filter((item) => item.status === "in-progress").length;
  const completeCount = items.filter((item) => item.status === "complete").length;

  setMetric(queueTotalNode, items.length);
  setMetric(queueActiveNode, activeCount);
  setMetric(queueCompleteNode, completeCount);

  if (!items.length) {
    queueSummaryNode.textContent = "No public requests yet.";
    return;
  }

  queueSummaryNode.textContent = summarizeLatestItem(items[0]);
}

function setMetric(node, value) {
  node.textContent = `${value}`;
}

function summarizeLatestItem(item) {
  const trimmedTitle = item.title.length > 48 ? `${item.title.slice(0, 45).trimEnd()}...` : item.title;
  return `#${item.number} ${formatStatus(item.status)} - ${trimmedTitle}`;
}

function formatStatus(status) {
  return status.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
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
