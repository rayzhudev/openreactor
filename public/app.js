const form = document.querySelector("#request-form");
const statusNode = document.querySelector("#form-status");
const requestField = document.querySelector("#request");
const submitButton = document.querySelector("#submit-button");
const requestCountNode = document.querySelector("#request-count");
const repoStarLink = document.querySelector("#repo-star-link");
const queueBoard = document.querySelector("#queue-board");
const queueTableWrap = document.querySelector("#queue-table-wrap");
const queueTableBody = document.querySelector("#queue-table-body");
const queueStatusNode = document.querySelector("#queue-status");
const queueRepoLink = document.querySelector("#queue-repo-link");
const queueViewButtons = Array.from(document.querySelectorAll(".queue-view-button"));

const SUBMIT_BUTTON_LABEL = "Submit";
const BOARD_COLUMNS = [
  { key: "queued", label: "Queued", description: "Fresh requests waiting for pickup." },
  { key: "in-progress", label: "In progress", description: "Being reviewed or actively shipped." },
  { key: "complete", label: "Complete", description: "Closed because the work shipped." },
  { key: "rejected", label: "Rejected", description: "Publicly declined for product reasons." }
];

let queueItems = [];
let activeQueueView = "board";

boot();

async function boot() {
  form.addEventListener("submit", onSubmit);
  requestField.addEventListener("input", onRequestInput);
  for (const button of queueViewButtons) {
    button.addEventListener("click", onQueueViewChange);
  }
  updateRequestCount(requestField.value);
  renderQueueView();
  await Promise.all([loadRepoMeta(), loadQueue()]);
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

async function loadQueue() {
  setQueueStatus("Loading queue...");
  queueItems = [];
  renderQueueView();

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
  queueItems = items;

  if (repoUrl) {
    renderRepoStarLink(repoUrl);
    queueRepoLink.href = repoUrl;
    queueRepoLink.hidden = false;
  } else {
    queueRepoLink.hidden = true;
    queueRepoLink.removeAttribute("href");
  }

  if (!items.length) {
    renderQueueView();
    setQueueStatus("No requests yet.");
    return;
  }

  renderQueueView();
  setQueueStatus(`${items.length} request${items.length === 1 ? "" : "s"}.`);
}

function renderQueueError(message) {
  queueItems = [];
  renderQueueView();
  queueRepoLink.hidden = true;
  queueRepoLink.removeAttribute("href");
  setQueueStatus(`${message} See GitHub directly if needed.`, "error");
}

function setQueueStatus(message, tone) {
  queueStatusNode.textContent = message;
  queueStatusNode.className = tone ? `queue-status ${tone}` : "queue-status";
}

function onQueueViewChange(event) {
  const nextView = event.currentTarget.dataset.view;

  if (!nextView || nextView === activeQueueView) {
    return;
  }

  activeQueueView = nextView;
  renderQueueView();
}

function renderQueueView() {
  queueBoard.hidden = activeQueueView !== "board";
  queueTableWrap.hidden = activeQueueView !== "list";

  for (const button of queueViewButtons) {
    const isActive = button.dataset.view === activeQueueView;
    button.dataset.active = String(isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }

  renderQueueBoard(queueItems);
  renderQueueTable(queueItems);
}

function renderQueueBoard(items) {
  queueBoard.innerHTML = "";

  const groupedItems = new Map(BOARD_COLUMNS.map((column) => [column.key, []]));

  for (const item of items) {
    const group = groupedItems.get(item.status) || groupedItems.get("queued");
    group.push(item);
  }

  const fragment = document.createDocumentFragment();

  for (const column of BOARD_COLUMNS) {
    const lane = document.createElement("section");
    lane.className = "queue-lane";
    lane.dataset.status = column.key;

    const header = document.createElement("div");
    header.className = "queue-lane-header";

    const titleBlock = document.createElement("div");
    titleBlock.className = "queue-lane-title-block";

    const heading = document.createElement("h3");
    heading.className = "queue-lane-title";
    heading.textContent = column.label;

    const description = document.createElement("p");
    description.className = "queue-lane-description";
    description.textContent = column.description;

    titleBlock.append(heading, description);

    const count = document.createElement("span");
    count.className = "queue-lane-count";
    count.textContent = String(groupedItems.get(column.key)?.length || 0);

    header.append(titleBlock, count);

    const list = document.createElement("ul");
    list.className = "queue-lane-list";

    const columnItems = groupedItems.get(column.key) || [];

    if (!columnItems.length) {
      const empty = document.createElement("li");
      empty.className = "queue-lane-empty";
      empty.textContent = "No requests here yet.";
      list.append(empty);
    } else {
      for (const item of columnItems) {
        const row = document.createElement("li");
        row.className = "queue-card";
        row.append(createQueueCardLink(item));
        list.append(row);
      }
    }

    lane.append(header, list);
    fragment.append(lane);
  }

  queueBoard.append(fragment);
}

function renderQueueTable(items) {
  queueTableBody.innerHTML = "";

  const fragment = document.createDocumentFragment();

  for (const item of items) {
    const row = document.createElement("tr");

    const issueCell = document.createElement("td");
    issueCell.className = "queue-table-issue";
    issueCell.textContent = `#${item.number}`;

    const titleCell = document.createElement("td");
    const titleLink = document.createElement("a");
    titleLink.className = "queue-table-link";
    titleLink.href = item.url;
    titleLink.target = "_blank";
    titleLink.rel = "noreferrer";
    titleLink.textContent = item.title;
    titleCell.append(titleLink);

    const statusCell = document.createElement("td");
    const status = document.createElement("span");
    status.className = "queue-item-status";
    status.dataset.status = item.status;
    status.textContent = formatStatus(item.status);
    statusCell.append(status);

    const submittedCell = document.createElement("td");
    const submittedTime = document.createElement("time");
    submittedTime.className = "queue-table-time";
    submittedTime.dateTime = item.createdAt;
    submittedTime.title = item.createdAt;
    submittedTime.textContent = formatSubmissionTimestamp(item.createdAt);
    submittedCell.append(submittedTime);

    row.append(issueCell, titleCell, statusCell, submittedCell);
    fragment.append(row);
  }

  queueTableBody.append(fragment);
}

function createQueueCardLink(item) {
  const link = document.createElement("a");
  link.className = "queue-card-link";
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

  const cta = document.createElement("span");
  cta.className = "queue-item-cta";
  cta.textContent = "Open on GitHub";

  link.append(top, title, meta, cta);
  return link;
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
