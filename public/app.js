const form = document.querySelector("#request-form");
const statusNode = document.querySelector("#form-status");
const queueNode = document.querySelector("#queue");
const submitButton = document.querySelector("#submit-button");
const repoLink = document.querySelector("#repo-link");

boot();

async function boot() {
  await Promise.all([loadMeta(), loadQueue()]);
  form.addEventListener("submit", onSubmit);
}

async function loadMeta() {
  try {
    const response = await fetch("/api/meta");
    const data = await response.json();

    if (data.repoUrl) {
      repoLink.href = data.repoUrl;
      repoLink.hidden = false;
    }
  } catch {
    // The page is still useful even if repo metadata cannot be shown.
  }
}

async function loadQueue() {
  queueNode.innerHTML = "<p class=\"queue-state\">Loading queue...</p>";

  try {
    const response = await fetch("/api/requests");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Queue request failed.");
    }

    renderQueue(data.items || []);
  } catch (error) {
    queueNode.innerHTML = "";
    const message = document.createElement("p");
    message.className = "queue-state";
    message.textContent = error instanceof Error ? error.message : "Unable to load queue.";
    queueNode.append(message);
  }
}

async function onSubmit(event) {
  event.preventDefault();

  setStatus("");
  submitButton.disabled = true;
  submitButton.textContent = "Sending...";

  const payload = Object.fromEntries(new FormData(form).entries());

  try {
    const response = await fetch("/api/requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Submission failed.");
    }

    form.reset();
    setStatus(`Request queued as issue #${data.number}.`, "success");
    await loadQueue();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Submission failed.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Send to queue";
  }
}

function renderQueue(items) {
  queueNode.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "queue-state";
    empty.textContent = "No live requests yet.";
    queueNode.append(empty);
    return;
  }

  for (const item of items) {
    const card = document.createElement("article");
    card.className = "queue-card";

    const meta = document.createElement("div");
    meta.className = "queue-meta";

    const badge = document.createElement("span");
    badge.className = `status-badge status-${item.status}`;
    badge.textContent = item.status.replace("-", " ");

    const date = document.createElement("span");
    date.className = "queue-date";
    date.textContent = new Date(item.createdAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });

    meta.append(badge, date);

    const title = document.createElement("a");
    title.className = "queue-title";
    title.href = item.url;
    title.target = "_blank";
    title.rel = "noreferrer";
    title.textContent = item.title;

    const number = document.createElement("p");
    number.className = "queue-number";
    number.textContent = `Issue #${item.number}`;

    card.append(meta, title, number);
    queueNode.append(card);
  }
}

function setStatus(message, tone) {
  statusNode.textContent = message;
  statusNode.className = tone ? `status-message ${tone}` : "status-message";
}
