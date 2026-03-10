const form = document.querySelector("#request-form");
const statusNode = document.querySelector("#form-status");
const requestField = document.querySelector("#request");
const submitButton = document.querySelector("#submit-button");
const requestSignalNode = document.querySelector("#request-signal");
const requestSignalLabelNode = document.querySelector("#request-signal-label");
const requestSignalHintNode = document.querySelector("#request-signal-hint");
const requestSignalFillNode = document.querySelector("#request-signal-fill");
const requestCountNode = document.querySelector("#request-count");
const repoStarLink = document.querySelector("#repo-star-link");
const queueList = document.querySelector("#queue-list");
const queueStatusNode = document.querySelector("#queue-status");
const queueRepoLink = document.querySelector("#queue-repo-link");
const reactorleBoard = document.querySelector("#reactorle-board");
const reactorleStatusNode = document.querySelector("#reactorle-status");
const reactorleKeyboard = document.querySelector("#reactorle-keyboard");

const SUBMIT_BUTTON_LABEL = "Submit";
const REACTORLE_WORD_LENGTH = 5;
const REACTORLE_MAX_GUESSES = 6;
const REACTORLE_STORAGE_KEY = "openreactor-reactorle-state";
const REACTORLE_WORDS = [
  "agent",
  "build",
  "check",
  "claim",
  "draft",
  "issue",
  "label",
  "merge",
  "patch",
  "queue",
  "scope",
  "share",
  "shift",
  "solve",
  "stack",
  "state",
  "track"
];
const REACTORLE_KEYBOARD_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

let reactorleState = loadReactorleState();

boot();

async function boot() {
  form.addEventListener("submit", onSubmit);
  requestField.addEventListener("input", onRequestInput);
  updateRequestSignal(requestField.value);
  setupReactorle();
  await Promise.all([loadRepoMeta(), loadQueue()]);
}

function onRequestInput(event) {
  updateRequestSignal(event.currentTarget.value);
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
    updateRequestSignal("");
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

function updateRequestSignal(request) {
  const signal = evaluateRequestSignal(request);

  requestSignalNode.dataset.tone = signal.tone;
  requestSignalLabelNode.textContent = signal.label;
  requestSignalHintNode.textContent = signal.hint;
  requestSignalFillNode.style.width = `${signal.percent}%`;
  requestCountNode.textContent = `${request.length} / 2000`;
}

function evaluateRequestSignal(request) {
  const normalized = request.trim();

  if (!normalized) {
    return {
      tone: "draft",
      label: "Start with the problem and the product move you want.",
      hint: "High-signal requests name the current friction, the desired outcome, and any constraint the agent should respect.",
      percent: 6
    };
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  const lower = normalized.toLowerCase();
  const hasStructure = /[\n:;-]/.test(normalized);
  const mentionsGoal = /\b(need|want|should|because|so that|outcome|problem|constraint|fix|build)\b/.test(lower);

  let score = 0;
  score += Math.min(normalized.length, 420) / 6;
  score += Math.min(words.length, 45);

  if (hasStructure) {
    score += 10;
  }

  if (mentionsGoal) {
    score += 15;
  }

  const percent = Math.max(8, Math.min(100, Math.round(score)));

  if (normalized.length < 40 || words.length < 7) {
    return {
      tone: "rough",
      label: "Needs more signal.",
      hint: "Add the current friction and the concrete change you want so the issue reads like a product decision, not a slogan.",
      percent
    };
  }

  if (normalized.length < 110 || words.length < 18 || !mentionsGoal) {
    return {
      tone: "clear",
      label: "Clear enough to review.",
      hint: "A little more detail on the desired outcome or constraints would make the request easier to implement cleanly.",
      percent
    };
  }

  return {
    tone: "strong",
    label: "High-signal request.",
    hint: "This has enough context to survive intake and translate into an actionable GitHub issue.",
    percent
  };
}

function setStatus(message, tone) {
  statusNode.textContent = message;
  statusNode.className = tone ? `status-message ${tone}` : "status-message";
}

function setupReactorle() {
  renderReactorleBoard();
  renderReactorleKeyboard();
  renderReactorleStatus();
  document.addEventListener("keydown", onReactorleKeydown);
}

function onReactorleKeydown(event) {
  const target = event.target;

  if (
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return;
  }

  const key = event.key.toUpperCase();

  if (key === "BACKSPACE") {
    event.preventDefault();
    updateReactorleGuess("BACKSPACE");
    return;
  }

  if (key === "ENTER") {
    event.preventDefault();
    updateReactorleGuess("ENTER");
    return;
  }

  if (/^[A-Z]$/.test(key)) {
    event.preventDefault();
    updateReactorleGuess(key);
  }
}

function updateReactorleGuess(key) {
  if (reactorleState.status !== "playing") {
    return;
  }

  reactorleState.flash = "";

  if (key === "BACKSPACE") {
    reactorleState.currentGuess = reactorleState.currentGuess.slice(0, -1);
    persistReactorleState();
    renderReactorleBoard();
    renderReactorleStatus();
    return;
  }

  if (key === "ENTER") {
    submitReactorleGuess();
    return;
  }

  if (
    reactorleState.currentGuess.length < REACTORLE_WORD_LENGTH &&
    /^[A-Z]$/.test(key)
  ) {
    reactorleState.currentGuess += key.toLowerCase();
    persistReactorleState();
    renderReactorleBoard();
    renderReactorleStatus();
  }
}

function submitReactorleGuess() {
  if (reactorleState.currentGuess.length !== REACTORLE_WORD_LENGTH) {
    reactorleState.flash = "Use five letters.";
    renderReactorleStatus();
    return;
  }

  reactorleState.guesses.push(reactorleState.currentGuess);
  reactorleState.currentGuess = "";
  reactorleState.flash = "";

  if (reactorleState.guesses.at(-1) === reactorleState.answer) {
    reactorleState.status = "won";
  } else if (reactorleState.guesses.length >= REACTORLE_MAX_GUESSES) {
    reactorleState.status = "lost";
  }

  persistReactorleState();
  renderReactorleBoard();
  renderReactorleKeyboard();
  renderReactorleStatus();
}

function renderReactorleBoard() {
  reactorleBoard.innerHTML = "";
  const fragment = document.createDocumentFragment();

  for (let rowIndex = 0; rowIndex < REACTORLE_MAX_GUESSES; rowIndex += 1) {
    const row = document.createElement("div");
    row.className = "reactorle-row";
    row.setAttribute("role", "row");
    const guess = getReactorleDisplayGuess(rowIndex);
    const evaluation =
      rowIndex < reactorleState.guesses.length
        ? evaluateGuess(reactorleState.guesses[rowIndex], reactorleState.answer)
        : [];

    for (let columnIndex = 0; columnIndex < REACTORLE_WORD_LENGTH; columnIndex += 1) {
      const tile = document.createElement("div");
      tile.className = "reactorle-tile";
      tile.setAttribute("role", "gridcell");
      tile.textContent = guess[columnIndex] ? guess[columnIndex].toUpperCase() : "";

      const status = evaluation[columnIndex];
      if (status) {
        tile.dataset.state = status;
      } else if (
        rowIndex === reactorleState.guesses.length &&
        columnIndex < reactorleState.currentGuess.length
      ) {
        tile.dataset.state = "active";
      } else {
        tile.dataset.state = "empty";
      }

      row.append(tile);
    }

    fragment.append(row);
  }

  reactorleBoard.append(fragment);
}

function renderReactorleKeyboard() {
  reactorleKeyboard.innerHTML = "";
  const letterStates = collectKeyboardLetterStates();
  const fragment = document.createDocumentFragment();

  for (const rowKeys of REACTORLE_KEYBOARD_ROWS) {
    const row = document.createElement("div");
    row.className = "reactorle-keyboard-row";

    if (rowKeys === REACTORLE_KEYBOARD_ROWS.at(-1)) {
      row.append(buildReactorleKey("Enter", "ENTER", "wide"));
    }

    for (const key of rowKeys) {
      row.append(buildReactorleKey(key, key, letterStates.get(key.toLowerCase()) || "unused"));
    }

    if (rowKeys === REACTORLE_KEYBOARD_ROWS.at(-1)) {
      row.append(buildReactorleKey("Back", "BACKSPACE", "wide"));
    }

    fragment.append(row);
  }

  reactorleKeyboard.append(fragment);
}

function buildReactorleKey(label, value, state) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "reactorle-key";
  button.dataset.state = state;
  button.textContent = label;
  button.addEventListener("click", () => updateReactorleGuess(value));
  return button;
}

function renderReactorleStatus() {
  if (reactorleState.flash) {
    reactorleStatusNode.textContent = reactorleState.flash;
    reactorleStatusNode.dataset.state = "info";
    return;
  }

  if (reactorleState.status === "won") {
    const guessesUsed = reactorleState.guesses.length;
    reactorleStatusNode.textContent = `Solved in ${guessesUsed} guess${guessesUsed === 1 ? "" : "es"}. Tomorrow brings a new word.`;
    reactorleStatusNode.dataset.state = "won";
    return;
  }

  if (reactorleState.status === "lost") {
    reactorleStatusNode.textContent = `Out of guesses. Today's word was ${reactorleState.answer.toUpperCase()}.`;
    reactorleStatusNode.dataset.state = "lost";
    return;
  }

  reactorleStatusNode.textContent = `${REACTORLE_MAX_GUESSES - reactorleState.guesses.length} guesses left.`;
  reactorleStatusNode.dataset.state = "playing";
}

function getReactorleDisplayGuess(rowIndex) {
  if (rowIndex < reactorleState.guesses.length) {
    return reactorleState.guesses[rowIndex];
  }

  if (rowIndex === reactorleState.guesses.length) {
    return reactorleState.currentGuess;
  }

  return "";
}

function collectKeyboardLetterStates() {
  const letterStates = new Map();
  const ranking = { absent: 1, present: 2, correct: 3 };

  for (const guess of reactorleState.guesses) {
    const evaluation = evaluateGuess(guess, reactorleState.answer);

    for (let index = 0; index < guess.length; index += 1) {
      const letter = guess[index];
      const nextState = evaluation[index];
      const currentState = letterStates.get(letter);

      if (!currentState || ranking[nextState] > ranking[currentState]) {
        letterStates.set(letter, nextState);
      }
    }
  }

  return letterStates;
}

function loadReactorleState() {
  const puzzleDate = getLocalDateStamp();
  const answer = getReactorleAnswer(puzzleDate);

  try {
    const raw = localStorage.getItem(REACTORLE_STORAGE_KEY);

    if (raw) {
      const parsed = JSON.parse(raw);

      if (
        parsed &&
        parsed.date === puzzleDate &&
        parsed.answer === answer &&
        Array.isArray(parsed.guesses) &&
        typeof parsed.currentGuess === "string" &&
        typeof parsed.status === "string"
      ) {
        return {
          date: puzzleDate,
          answer,
          guesses: parsed.guesses.slice(0, REACTORLE_MAX_GUESSES),
          currentGuess: parsed.currentGuess.slice(0, REACTORLE_WORD_LENGTH),
          status: ["playing", "won", "lost"].includes(parsed.status)
            ? parsed.status
            : "playing",
          flash: ""
        };
      }
    }
  } catch {}

  return {
    date: puzzleDate,
    answer,
    guesses: [],
    currentGuess: "",
    status: "playing",
    flash: ""
  };
}

function persistReactorleState() {
  try {
    localStorage.setItem(
      REACTORLE_STORAGE_KEY,
      JSON.stringify({
        date: reactorleState.date,
        answer: reactorleState.answer,
        guesses: reactorleState.guesses,
        currentGuess: reactorleState.currentGuess,
        status: reactorleState.status
      })
    );
  } catch {}
}

function getReactorleAnswer(dateStamp) {
  let hash = 0;

  for (const character of dateStamp) {
    hash = (hash * 31 + character.charCodeAt(0)) % REACTORLE_WORDS.length;
  }

  return REACTORLE_WORDS[hash];
}

function getLocalDateStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function evaluateGuess(guess, answer) {
  const statuses = Array(REACTORLE_WORD_LENGTH).fill("absent");
  const remainingLetters = answer.split("");

  for (let index = 0; index < REACTORLE_WORD_LENGTH; index += 1) {
    if (guess[index] === answer[index]) {
      statuses[index] = "correct";
      remainingLetters[index] = "";
    }
  }

  for (let index = 0; index < REACTORLE_WORD_LENGTH; index += 1) {
    if (statuses[index] === "correct") {
      continue;
    }

    const remainingIndex = remainingLetters.indexOf(guess[index]);
    if (remainingIndex >= 0) {
      statuses[index] = "present";
      remainingLetters[remainingIndex] = "";
    }
  }

  return statuses;
}

async function loadQueue() {
  setQueueStatus("Loading queue...");
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
    setQueueStatus("No requests yet.");
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

    const cta = document.createElement("span");
    cta.className = "queue-item-cta";
    cta.textContent = "Open on GitHub";

    link.append(top, title, meta, cta);
    row.append(link);
    fragment.append(row);
  }

  queueList.append(fragment);
  setQueueStatus(`${items.length} request${items.length === 1 ? "" : "s"}.`);
}

function renderQueueError(message) {
  queueList.innerHTML = "";
  queueRepoLink.hidden = true;
  queueRepoLink.removeAttribute("href");
  setQueueStatus(`${message} See GitHub directly if needed.`, "error");
}

function setQueueStatus(message, tone) {
  queueStatusNode.textContent = message;
  queueStatusNode.className = tone ? `queue-status ${tone}` : "queue-status";
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
