const form = document.querySelector("#request-form");
const statusNode = document.querySelector("#form-status");
const summaryField = document.querySelector("#summary");
const problemField = document.querySelector("#problem");
const outcomeField = document.querySelector("#outcome");
const submitButton = document.querySelector("#submit-button");
const repoStarLink = document.querySelector("#repo-star-link");
const queueList = document.querySelector("#queue-list");
const queueStatusNode = document.querySelector("#queue-status");
const queueRepoLink = document.querySelector("#queue-repo-link");

boot();

async function boot() {
  form.addEventListener("submit", onSubmit);
  await Promise.all([loadRepoMeta(), loadQueue()]);
}

async function onSubmit(event) {
  event.preventDefault();

  setStatus("");
  submitButton.disabled = true;
  submitButton.textContent = "Sending...";

  const formData = new FormData(form);
  const summary = `${formData.get("summary") ?? ""}`.trim();
  const problem = `${formData.get("problem") ?? ""}`.trim();
  const outcome = `${formData.get("outcome") ?? ""}`.trim();
  const website = `${formData.get("website") ?? ""}`;
  const payload = buildPayload(summary, problem, outcome, website);
  const validationError = validatePayload(payload);

  if (validationError) {
    setStatus(validationError, "error");
    focusFirstInvalidField(payload);
    submitButton.disabled = false;
    submitButton.innerHTML = "<span aria-hidden=\"true\">+</span>";
    return;
  }

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
    summaryField.focus();
    await loadQueue();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Submission failed.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = "<span aria-hidden=\"true\">+</span>";
  }
}

function buildPayload(summary, problem, outcome, website) {
  return {
    website,
    summary,
    problem,
    outcome,
    constraints: "",
    successCriteria: "",
    notes: ""
  };
}

function setStatus(message, tone) {
  statusNode.textContent = message;
  statusNode.className = tone ? `status-message ${tone}` : "status-message";
}

function validatePayload(payload) {
  if (payload.summary.length < 8 || payload.summary.length > 120) {
    return "Summary must be between 8 and 120 characters.";
  }

  if (payload.problem.length < 20 || payload.problem.length > 1200) {
    return "Problem must be between 20 and 1200 characters.";
  }

  if (payload.outcome.length < 20 || payload.outcome.length > 1200) {
    return "Desired outcome must be between 20 and 1200 characters.";
  }

  return "";
}

function focusFirstInvalidField(payload) {
  if (payload.summary.length < 8 || payload.summary.length > 120) {
    summaryField.focus();
    return;
  }

  if (payload.problem.length < 20 || payload.problem.length > 1200) {
    problemField.focus();
    return;
  }

  if (payload.outcome.length < 20 || payload.outcome.length > 1200) {
    outcomeField.focus();
  }
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

    const title = document.createElement("span");
    title.className = "queue-item-title";
    title.textContent = item.title;

    const status = document.createElement("span");
    status.className = "queue-item-status";
    status.dataset.status = item.status;
    status.textContent = formatStatus(item.status);

    const meta = document.createElement("span");
    meta.className = "queue-item-meta";
    meta.textContent = `#${item.number} · ${formatDate(item.createdAt)}`;

    link.append(title, status, meta);
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
  setQueueStatus(`${message} Check GitHub directly if the queue API is unavailable.`, "error");
}

function setQueueStatus(message, tone) {
  queueStatusNode.textContent = message;
  queueStatusNode.className = tone ? `queue-status ${tone}` : "queue-status";
}

function formatStatus(status) {
  return status.replace(/-/g, " ");
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "unknown date";
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
