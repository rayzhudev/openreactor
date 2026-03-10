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
const queueRefreshNoteNode = document.querySelector("#queue-refresh-note");
const queueRepoLink = document.querySelector("#queue-repo-link");
const leaderboardList = document.querySelector("#leaderboard-list");
const leaderboardStatusNode = document.querySelector("#leaderboard-status");
const leaderboardSummaryNode = document.querySelector("#leaderboard-summary");
const leaderboardTotalPrsNode = document.querySelector("#leaderboard-total-prs");
const leaderboardTotalAuthorsNode = document.querySelector("#leaderboard-total-authors");
const leaderboardLatestMergeNode = document.querySelector("#leaderboard-latest-merge");
const reactorleBoard = document.querySelector("#reactorle-board");
const reactorleStatusNode = document.querySelector("#reactorle-status");
const reactorleKeyboard = document.querySelector("#reactorle-keyboard");
const queueViewButtons = Array.from(document.querySelectorAll(".queue-view-button"));
const queueNewerButton = document.querySelector("#queue-newer");
const queueOlderButton = document.querySelector("#queue-older");
const queuePageLabelNode = document.querySelector("#queue-page-label");
const updateNotice = document.querySelector("#update-notice");
const updateNoticeButton = document.querySelector("#update-notice-button");

const SUBMIT_BUTTON_LABEL = "Submit";
const DEFAULT_QUEUE_PAGE = getQueuePageFromLocation();
const DEPLOY_CHECK_INTERVAL_MS = 60_000;
const DEPLOY_CHECK_PATHS = ["/index.html", "/app.js", "/styles.css"];
const QUEUE_POLL_INTERVAL_MS = 30_000;
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
const BOARD_COLUMNS = [
  { key: "queued", label: "Queued", description: "Fresh requests waiting for pickup." },
  { key: "in-progress", label: "In progress", description: "Being reviewed or actively shipped." },
  { key: "complete", label: "Complete", description: "Closed because the work shipped." },
  { key: "rejected", label: "Rejected", description: "Publicly declined for product reasons." }
];

let queueEtag = "";
let lastQueueRefreshAt = 0;
let queuePollTimer = 0;
let queueItems = [];
let activeQueueView = "board";
const queueState = {
  page: DEFAULT_QUEUE_PAGE,
  isLoading: false,
  hasPreviousPage: DEFAULT_QUEUE_PAGE > 1,
  hasNextPage: false
};
let deployFingerprint = "";
let deployCheckTimer = 0;
let updateAvailable = false;
let reactorleState = loadReactorleState();

boot();

async function boot() {
  form.addEventListener("submit", onSubmit);
  requestField.addEventListener("input", onRequestInput);
  setupReactorle();
  initDeployWatcher();
  document.addEventListener("visibilitychange", onVisibilityChange);

  for (const button of queueViewButtons) {
    button.addEventListener("click", onQueueViewChange);
  }

  queueNewerButton.addEventListener("click", () => changeQueuePage(queueState.page - 1));
  queueOlderButton.addEventListener("click", () => changeQueuePage(queueState.page + 1));

  updateRequestCount(requestField.value);
  renderQueueView();
  syncQueueControls({
    page: queueState.page,
    hasPreviousPage: queueState.hasPreviousPage,
    hasNextPage: queueState.hasNextPage
  });
  await Promise.all([loadRepoMeta(), loadQueue(queueState.page), loadLeaderboard()]);
  startQueuePolling();
}

function initDeployWatcher() {
  if (!updateNotice || !updateNoticeButton) {
    return;
  }

  updateNoticeButton.addEventListener("click", reloadForUpdate);
  window.addEventListener("focus", checkForDeployUpdate);
  window.addEventListener("online", checkForDeployUpdate);

  deployCheckTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") {
      void checkForDeployUpdate();
    }
  }, DEPLOY_CHECK_INTERVAL_MS);

  void primeDeployFingerprint();
}

async function primeDeployFingerprint() {
  const fingerprint = await fetchDeployFingerprint();

  if (fingerprint) {
    deployFingerprint = fingerprint;
  }
}

async function checkForDeployUpdate() {
  if (updateAvailable) {
    return;
  }

  const fingerprint = await fetchDeployFingerprint();

  if (!fingerprint) {
    return;
  }

  if (!deployFingerprint) {
    deployFingerprint = fingerprint;
    return;
  }

  if (fingerprint !== deployFingerprint) {
    showUpdateNotice();
  }
}

async function fetchDeployFingerprint() {
  try {
    const resources = await Promise.all(DEPLOY_CHECK_PATHS.map((path) => fetchDeployResource(path)));
    return hashString(resources.join("\n/* openreactor-deploy */\n"));
  } catch {
    return "";
  }
}

async function fetchDeployResource(path) {
  const url = new URL(path, window.location.origin);
  url.searchParams.set("__openreactor", `${Date.now()}`);

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache"
    }
  });

  if (!response.ok) {
    throw new Error(`Unable to check ${path}.`);
  }

  return response.text();
}

function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `${hash >>> 0}`;
}

function showUpdateNotice() {
  updateAvailable = true;
  updateNotice.hidden = false;
  updateNotice.dataset.visible = "true";
  updateNoticeButton.focus({ preventScroll: true });
  stopDeployWatcher();
}

function stopDeployWatcher() {
  if (deployCheckTimer) {
    window.clearInterval(deployCheckTimer);
    deployCheckTimer = 0;
  }

  window.removeEventListener("focus", checkForDeployUpdate);
  window.removeEventListener("online", checkForDeployUpdate);
}

function reloadForUpdate() {
  window.location.reload();
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
    await loadQueue(1);
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

async function loadQueue(page = 1, options = {}) {
  const { silent = false } = options;
  queueState.isLoading = true;
  queueState.page = page;

  if (!silent) {
    setQueueStatus("Loading queue...");
    setQueueRefreshNote("");
    queueItems = [];
    renderQueueView();
  }

  syncQueueControls({
    page,
    hasPreviousPage: page > 1,
    hasNextPage: false
  });

  try {
    const headers = queueEtag ? { "If-None-Match": queueEtag } : {};
    const response = await fetch(`/api/requests?page=${page}`, {
      headers,
      cache: "no-store"
    });

    if (response.status === 304) {
      markQueueRefresh();
      refreshQueueStatusCopy(queueItems.length, page);
      return;
    }

    const data = await readJsonResponse(response, "queue");

    if (!response.ok) {
      throw new Error(data.error || "Unable to load the public queue.");
    }

    queueEtag = response.headers.get("etag") || "";
    renderQueue(data);
  } catch (error) {
    queueEtag = "";
    renderQueueError(error instanceof Error ? error.message : "Unable to load the public queue.");
  } finally {
    queueState.isLoading = false;
    syncQueueControls(queueState);
  }
}

async function loadLeaderboard() {
  setLeaderboardStatus("Loading leaderboard...");
  leaderboardList.innerHTML = "";

  try {
    const response = await fetch("/api/leaderboard", {
      cache: "no-store"
    });
    const data = await readJsonResponse(response, "leaderboard");

    if (!response.ok) {
      throw new Error(data.error || "Unable to load the contributor leaderboard.");
    }

    renderLeaderboard(data.items || [], data.totals || {});
  } catch (error) {
    renderLeaderboardError(
      error instanceof Error ? error.message : "Unable to load the contributor leaderboard."
    );
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

function renderQueue(data) {
  const items = data.items || [];
  const page = Number.isInteger(data.page) ? data.page : 1;
  const hasPreviousPage = Boolean(data.hasPreviousPage);
  const hasNextPage = Boolean(data.hasNextPage);
  const repoUrl = data.repoUrl || "";

  markQueueRefresh();
  queueItems = items;
  queueState.page = page;
  queueState.hasPreviousPage = hasPreviousPage;
  queueState.hasNextPage = hasNextPage;
  updateQueueLocation(page);
  syncQueueControls({ page, hasPreviousPage, hasNextPage });

  if (repoUrl) {
    renderRepoStarLink(repoUrl);
    queueRepoLink.href = repoUrl;
    queueRepoLink.hidden = false;
  } else {
    queueRepoLink.hidden = true;
    queueRepoLink.removeAttribute("href");
  }

  renderQueueView();

  if (!items.length) {
    setQueueStatus(page === 1 ? "No requests yet." : `Page ${page} has no requests.`);
    setQueueRefreshNote(
      page === 1
        ? `Last checked ${formatRelativeRefreshTime(lastQueueRefreshAt)}. Auto-refreshes every ${formatPollInterval()}.`
        : `Page ${page} is empty.`
    );
    return;
  }

  refreshQueueStatusCopy(items.length, page);
}

function renderQueueError(message) {
  queueItems = [];
  renderQueueView();
  queueRepoLink.hidden = true;
  queueRepoLink.removeAttribute("href");
  syncQueueControls({
    page: queueState.page,
    hasPreviousPage: queueState.hasPreviousPage,
    hasNextPage: queueState.hasNextPage
  });
  setQueueStatus(`${message} See GitHub directly if needed.`, "error");
  setQueueRefreshNote(`Auto-refresh retries every ${formatPollInterval()}.`);
}

function renderLeaderboard(items, totals) {
  leaderboardList.innerHTML = "";
  leaderboardTotalPrsNode.textContent = `${totals.mergedPullRequests || 0}`;
  leaderboardTotalAuthorsNode.textContent = `${totals.contributors || 0}`;
  leaderboardLatestMergeNode.textContent = totals.latestMergedAt
    ? formatShortDate(totals.latestMergedAt)
    : "No merges yet";

  if (!items.length) {
    leaderboardSummaryNode.textContent = "No merged pull requests yet.";
    setLeaderboardStatus("Leaderboard will appear after the first merged pull request.");
    return;
  }

  leaderboardSummaryNode.textContent =
    "Ranks GitHub accounts by merged pull requests authored in this repository.";
  const fragment = document.createDocumentFragment();

  for (const [index, item] of items.entries()) {
    const row = document.createElement("li");
    row.className = "leaderboard-item";

    const rank = document.createElement("span");
    rank.className = "leaderboard-rank";
    rank.textContent = `#${index + 1}`;

    const body = document.createElement("div");
    body.className = "leaderboard-item-body";

    const top = document.createElement("div");
    top.className = "leaderboard-item-top";

    const profile = document.createElement("a");
    profile.className = "leaderboard-profile";
    profile.href = item.profileUrl;
    profile.target = "_blank";
    profile.rel = "noreferrer";
    profile.textContent = `@${item.login}`;

    const badge = document.createElement("span");
    badge.className = "leaderboard-badge";
    badge.textContent = item.accountType === "Bot" ? "Bot" : "Account";

    top.append(profile, badge);

    const count = document.createElement("p");
    count.className = "leaderboard-count";
    count.textContent = `${item.mergedCount} merged PR${item.mergedCount === 1 ? "" : "s"}`;

    const latest = document.createElement("a");
    latest.className = "leaderboard-latest";
    latest.href = item.latestPullRequest.url;
    latest.target = "_blank";
    latest.rel = "noreferrer";
    latest.textContent = `Latest: #${item.latestPullRequest.number} ${item.latestPullRequest.title}`;

    body.append(top, count, latest);
    row.append(rank, body);
    fragment.append(row);
  }

  leaderboardList.append(fragment);
  setLeaderboardStatus(`${items.length} ranked account${items.length === 1 ? "" : "s"} shown.`);
}

function renderLeaderboardError(message) {
  leaderboardList.innerHTML = "";
  leaderboardSummaryNode.textContent = "Contributor data unavailable right now.";
  leaderboardTotalPrsNode.textContent = "0";
  leaderboardTotalAuthorsNode.textContent = "0";
  leaderboardLatestMergeNode.textContent = "Unavailable";
  setLeaderboardStatus(`${message} Try again later.`, "error");
}

function setQueueStatus(message, tone) {
  queueStatusNode.textContent = message;
  queueStatusNode.className = tone ? `queue-status ${tone}` : "queue-status";
}

function setLeaderboardStatus(message, tone) {
  leaderboardStatusNode.textContent = message;
  leaderboardStatusNode.className = tone
    ? `leaderboard-status ${tone}`
    : "leaderboard-status";
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

    void loadQueue(queueState.page, { silent: true });
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

  void checkForDeployUpdate();

  if (Date.now() - lastQueueRefreshAt >= QUEUE_POLL_INTERVAL_MS) {
    void loadQueue(queueState.page, { silent: true });
  }
}

function refreshQueueStatusCopy(itemCount = queueItems.length, page = queueState.page) {
  const countLabel = `${itemCount} request${itemCount === 1 ? "" : "s"}.`;
  const freshnessLabel = lastQueueRefreshAt
    ? `Last checked ${formatRelativeRefreshTime(lastQueueRefreshAt)}.`
    : "Waiting for the first refresh.";
  setQueueStatus(`Page ${page}. ${countLabel} Auto-refreshes every ${formatPollInterval()}.`);
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
    titleLink.href = item.commentUrl || item.url;
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
  const queueDetail = formatQueueDetail(item.statusDetail, item.statusUpdatedAt);
  submittedTime.textContent = queueDetail || formatSubmissionTimestamp(item.createdAt);
  submittedCell.append(submittedTime);

    row.append(issueCell, titleCell, statusCell, submittedCell);
    fragment.append(row);
  }

  queueTableBody.append(fragment);
}

function createQueueCardLink(item) {
  const link = document.createElement("a");
  link.className = "queue-card-link";
  link.href = item.commentUrl || item.url;
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

  const meta = document.createElement("div");
  meta.className = "queue-item-meta";

  if (item.githubUsername) {
    const username = document.createElement("span");
    username.className = "queue-item-username";
    username.textContent = formatGitHubUsername(item.githubUsername);
    meta.append(username);
  }

  const submittedAt = document.createElement("time");
  submittedAt.className = "queue-item-submitted-at";
  submittedAt.dateTime = item.createdAt;
  submittedAt.title = item.createdAt;
  submittedAt.textContent = formatSubmissionTimestamp(item.createdAt);
  meta.append(submittedAt);

  const discussion = document.createElement("div");
  discussion.className = "queue-item-discussion";

  const commentCount = document.createElement("span");
  commentCount.className = "queue-item-comment-count";
  commentCount.textContent = formatCommentCount(item.commentCount);

  const commentHint = document.createElement("span");
  commentHint.className = "queue-item-comment-hint";
  commentHint.textContent =
    formatQueueDetail(item.statusDetail, item.statusUpdatedAt) ||
    (item.commentCount > 0
      ? "Discussion already started on GitHub."
      : "Be the first to add context on GitHub.");

  discussion.append(commentCount, commentHint);

  const cta = document.createElement("span");
  cta.className = "queue-item-cta";
  cta.textContent = "Open issue and comment on GitHub";

  link.append(top, title, meta, discussion, cta);
  return link;
}

function formatStatus(status) {
  return status.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatGitHubUsername(value) {
  return `@${value.replace(/^@+/, "")}`;
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

function formatShortDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
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

function formatCommentCount(value) {
  const count = Number.isFinite(value) ? Math.max(0, value) : 0;
  return `${count} comment${count === 1 ? "" : "s"}`;
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

function changeQueuePage(page) {
  if (queueState.isLoading || page < 1 || page === queueState.page) {
    return;
  }

  void loadQueue(page);
}

function syncQueueControls({ page, hasPreviousPage, hasNextPage }) {
  queueState.page = page;
  queueState.hasPreviousPage = hasPreviousPage;
  queueState.hasNextPage = hasNextPage;
  queuePageLabelNode.textContent = `Page ${page}`;
  queueNewerButton.disabled = queueState.isLoading || !hasPreviousPage;
  queueOlderButton.disabled = queueState.isLoading || !hasNextPage;
}

function updateQueueLocation(page) {
  const url = new URL(window.location.href);

  if (page <= 1) {
    url.searchParams.delete("page");
  } else {
    url.searchParams.set("page", `${page}`);
  }

  window.history.replaceState({}, "", url);
}

function getQueuePageFromLocation() {
  const value = new URL(window.location.href).searchParams.get("page");
  const page = Number.parseInt(value ?? "1", 10);

  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }

  return page;
}
