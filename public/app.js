const form = document.querySelector("#request-form");
const statusNode = document.querySelector("#form-status");
const requestField = document.querySelector("#request");
const submitButton = document.querySelector("#submit-button");
const requestCountNode = document.querySelector("#request-count");
const repoStarLink = document.querySelector("#repo-star-link");
const myRequestsList = document.querySelector("#my-requests-list");
const myRequestsStatusNode = document.querySelector("#my-requests-status");
const queueBoard = document.querySelector("#queue-board");
const queueTableWrap = document.querySelector("#queue-table-wrap");
const queueTableBody = document.querySelector("#queue-table-body");
const queueArchive = document.querySelector("#queue-archive");
const queueArchiveList = document.querySelector("#queue-archive-list");
const queueArchiveCountNode = document.querySelector("#queue-archive-count");
const queueArchivePagination = document.querySelector("#queue-archive-pagination");
const queueStatusNode = document.querySelector("#queue-status");
const queueRefreshNoteNode = document.querySelector("#queue-refresh-note");
const queueRepoLink = document.querySelector("#queue-repo-link");
const openReactorLiveStatusNode = document.querySelector("#openreactor-live-status");
const openReactorLiveRefreshNode = document.querySelector("#openreactor-live-refresh");
const openReactorLiveReactorNode = document.querySelector("#openreactor-live-reactor");
const openReactorLiveWatchdogNode = document.querySelector("#openreactor-live-watchdog");
const openReactorLiveActiveNode = document.querySelector("#openreactor-live-active");
const openReactorLiveBlockedNode = document.querySelector("#openreactor-live-blocked");
const openReactorLiveAgentsNode = document.querySelector("#openreactor-live-agents");
const openReactorLiveBlockersNode = document.querySelector("#openreactor-live-blockers");
const openReactorPipelineNode = document.querySelector("#openreactor-pipeline");
const leaderboardList = document.querySelector("#leaderboard-list");
const leaderboardStatusNode = document.querySelector("#leaderboard-status");
const leaderboardSummaryNode = document.querySelector("#leaderboard-summary");
const leaderboardTotalPrsNode = document.querySelector("#leaderboard-total-prs");
const leaderboardTotalAuthorsNode = document.querySelector("#leaderboard-total-authors");
const leaderboardLatestMergeNode = document.querySelector("#leaderboard-latest-merge");
const leaderboardStatsNode = document.querySelector(".leaderboard-stats");
const reactorleBoard = document.querySelector("#reactorle-board");
const reactorleStatusNode = document.querySelector("#reactorle-status");
const reactorleKeyboard = document.querySelector("#reactorle-keyboard");
const queueViewButtons = Array.from(document.querySelectorAll(".queue-view-button"));
const queueNewerButton = document.querySelector("#queue-newer");
const queueOlderButton = document.querySelector("#queue-older");
const queuePageLabelNode = document.querySelector("#queue-page-label");
const updateNotice = document.querySelector("#update-notice");
const updateNoticeButton = document.querySelector("#update-notice-button");
const themeOptionNodes = Array.from(document.querySelectorAll(".theme-option"));
const authSignInNode = document.querySelector("#auth-sign-in");
const authUserMenuNode = document.querySelector("#auth-user-menu");
const authUserButton = document.querySelector("#auth-user-button");
const authAvatarNode = document.querySelector("#auth-avatar");
const authLoginNode = document.querySelector("#auth-login");
const authDropdownNode = document.querySelector("#auth-dropdown");
const authProfileLink = document.querySelector("#auth-profile-link");
const authSignOutButton = document.querySelector("#auth-sign-out");

const SUBMIT_BUTTON_LABEL = "Submit";
const THEME_STORAGE_KEY = "openreactor-theme";
const MY_REQUESTS_STORAGE_KEY = "openreactor-my-requests";
const MAX_MY_REQUESTS = 12;
const DEFAULT_QUEUE_PAGE = getQueuePageFromLocation();
const DEPLOY_CHECK_INTERVAL_MS = 60_000;
const DEPLOY_CHECK_PATHS = ["/index.html", "/app.js", "/styles.css"];
const QUEUE_POLL_INTERVAL_MS = 30_000;
const OPENREACTOR_STATUS_POLL_INTERVAL_MS = 15_000;
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
  {
    key: "needs-refinement",
    label: "Needs Refinement",
    description: "Deferred until the request gets clearer scope or more detail."
  },
  { key: "in-progress", label: "In progress", description: "Being reviewed or actively shipped." }
];

/* ── Tailwind class helpers ──────────────────────────────────────── */

const CLS = {
  pill: "or-button or-button--secondary",
  pillSmall: "or-button or-button--secondary min-h-0 px-3 py-1.5",
};

function getStatusBadgeClasses(status) {
  const base = "or-badge or-status-badge";
  switch (status) {
    case "queued": return `${base} is-queued`;
    case "needs-refinement": return `${base} is-needs-refinement`;
    case "in-progress": return `${base} is-in-progress`;
    case "complete": return `${base} is-complete`;
    case "rejected": return `${base} is-rejected`;
    default: return `${base} is-queued`;
  }
}

function getStatusBorderColor(status) {
  switch (status) {
    case "queued": return "var(--queue-queued)";
    case "needs-refinement": return "var(--queue-refinement)";
    case "in-progress": return "var(--queue-progress)";
    case "complete": return "var(--queue-complete)";
    case "rejected": return "var(--queue-rejected)";
    default: return "var(--line-strong)";
  }
}

function getArchiveDotColor(status) {
  switch (status) {
    case "complete": return "var(--queue-complete)";
    case "rejected": return "var(--queue-rejected)";
    default: return "var(--ink-faint)";
  }
}

function getArchiveStatusColor(status) {
  switch (status) {
    case "complete": return "var(--queue-complete)";
    case "rejected": return "var(--queue-rejected)";
    default: return "var(--ink-faint)";
  }
}

function getReactorleTileClasses(state) {
  const base = "flex items-center justify-center aspect-square border rounded-lg font-sans text-2xl font-bold uppercase";
  switch (state) {
    case "correct": return `${base} bg-[rgba(32,116,90,0.14)] border-[rgba(32,116,90,0.28)] text-[var(--queue-complete)]`;
    case "present": return `${base} bg-[rgba(184,92,56,0.14)] border-[rgba(184,92,56,0.28)] text-[var(--queue-progress)]`;
    case "absent": return `${base} bg-[rgba(127,143,150,0.14)] border-[var(--line)] text-[var(--queue-queued)]`;
    case "active": return `${base} border-[rgba(184,92,56,0.38)] bg-[var(--surface)]`;
    default: return `${base} border-[var(--line)] bg-[var(--surface)]`;
  }
}

function getReactorleKeyClasses(state) {
  const base = "min-h-10 border rounded-lg text-sm font-semibold cursor-pointer hover:bg-[var(--surface-hover)]";
  switch (state) {
    case "correct": return `${base} bg-[rgba(32,116,90,0.14)] border-[var(--line)] text-[var(--queue-complete)]`;
    case "present": return `${base} bg-[rgba(184,92,56,0.14)] border-[var(--line)] text-[var(--queue-progress)]`;
    case "absent": return `${base} bg-[rgba(127,143,150,0.14)] border-[var(--line)] text-[var(--queue-queued)]`;
    case "wide": return `${base} col-span-2 border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]`;
    default: return `${base} border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]`;
  }
}

/* ── State ───────────────────────────────────────────────────────── */

let queueEtag = "";
let lastQueueRefreshAt = 0;
let lastOpenReactorRefreshAt = 0;
let queuePollTimer = 0;
let openReactorStatusTimer = 0;
let queueActiveItems = [];
let queueArchivedItems = [];
let myRequests = loadMyRequests();
let activeQueueView = "board";
const queueState = {
  page: DEFAULT_QUEUE_PAGE,
  isLoading: false,
  hasPreviousPage: DEFAULT_QUEUE_PAGE > 1,
  hasNextPage: false,
  archiveTotal: 0
};
let deployFingerprint = "";
let deployCheckTimer = 0;
let updateAvailable = false;
let reactorleState = loadReactorleState();
let supportSession = {
  authAvailable: false,
  authenticated: false,
  login: "",
  profileUrl: ""
};
let openReactorStatus = {
  available: false,
  services: {
    reactor: null,
    watchdog: null
  },
  agents: {
    activeCount: 0,
    pendingRetryCount: 0,
    maxConcurrentIssues: 0,
    items: []
  },
  blockers: {
    pausedCount: 0,
    pausedIssues: [],
    maintainerHandoffCount: 0,
    maintainerHandoffs: []
  },
  pipeline: null
};

initTopbarToggle();
boot();

function initTopbarToggle() {
  for (const toggle of document.querySelectorAll(".topbar-toggle")) {
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      const actions = toggle.parentElement.querySelector(".topbar-actions, .top-nav-items");
      if (actions) {
        if (!expanded) {
          actions.classList.remove("max-md:hidden");
          actions.classList.add("max-md:flex");
        } else {
          actions.classList.add("max-md:hidden");
          actions.classList.remove("max-md:flex");
        }
      }
    });
  }
}

async function boot() {
  initThemePicker();
  setupReactorle();
  initSupportSession();

  if (!form || !requestField || !submitButton) {
    return;
  }

  form.addEventListener("submit", onSubmit);
  requestField.addEventListener("input", onRequestInput);
  initDeployWatcher();
  document.addEventListener("visibilitychange", onVisibilityChange);

  for (const button of queueViewButtons) {
    button.addEventListener("click", onQueueViewChange);
  }

  queueNewerButton.addEventListener("click", () => changeQueuePage(queueState.page - 1));
  queueOlderButton.addEventListener("click", () => changeQueuePage(queueState.page + 1));

  updateRequestCount(requestField.value);
  renderMyRequests();
  renderQueueView();
  syncQueueControls({
    page: queueState.page,
    hasPreviousPage: queueState.hasPreviousPage,
    hasNextPage: queueState.hasNextPage
  });
  await Promise.all([
    loadRepoMeta(),
    loadSupportSession(),
    loadQueue(queueState.page),
    loadLeaderboard(),
    loadOpenReactorStatus()
  ]);
  startQueuePolling();
  startOpenReactorStatusPolling();
}

function initSupportSession() {
  if (!authSignInNode || !authUserMenuNode) {
    return;
  }

  if (authSignOutButton) {
    authSignOutButton.addEventListener("click", onSupportSignOut);
  }
  if (authUserButton && authDropdownNode) {
    authUserButton.addEventListener("click", toggleAuthDropdown);
    document.addEventListener("click", (e) => {
      if (!authUserMenuNode.contains(e.target)) {
        closeAuthDropdown();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAuthDropdown();
    });
  }
  renderSupportSession();
}

async function loadSupportSession() {
  if (!authSignInNode) {
    return;
  }

  try {
    const response = await fetch("/api/session", {
      cache: "no-store",
      credentials: "same-origin"
    });
    const data = await readJsonResponse(response, "session");

    if (!response.ok) {
      throw new Error(data.error || "Unable to load GitHub support session.");
    }

    supportSession = {
      authAvailable: Boolean(data.authAvailable),
      authenticated: Boolean(data.authenticated),
      login: data.login || "",
      profileUrl: data.profileUrl || ""
    };
  } catch {
    supportSession = {
      authAvailable: false,
      authenticated: false,
      login: "",
      profileUrl: ""
    };
  }

  renderSupportSession();
  renderQueueView();
  announceSupportSessionResult();
}

function initThemePicker() {
  if (!themeOptionNodes.length) {
    return;
  }

  const selectedTheme = getStoredTheme();
  renderThemeSelection(selectedTheme);

  for (const node of themeOptionNodes) {
    node.addEventListener("click", () => {
      const nextTheme = node.dataset.themeValue === "dark" || node.dataset.themeValue === "light"
        ? node.dataset.themeValue
        : "system";

      applyTheme(nextTheme);
      renderThemeSelection(nextTheme);
    });
  }
}

function getStoredTheme() {
  try {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);

    if (savedTheme === "dark" || savedTheme === "light") {
      return savedTheme;
    }
  } catch {}

  return "system";
}

function applyTheme(theme) {
  try {
    if (theme === "dark" || theme === "light") {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      document.documentElement.classList.remove("dark", "light");
      document.documentElement.classList.add(theme);
      return;
    }

    localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.classList.remove("dark", "light");
  } catch {
    if (theme === "dark" || theme === "light") {
      document.documentElement.classList.remove("dark", "light");
      document.documentElement.classList.add(theme);
      return;
    }

    document.documentElement.classList.remove("dark", "light");
  }
}

function renderThemeSelection(selectedTheme) {
  for (const node of themeOptionNodes) {
    const isActive = (node.dataset.themeValue || "system") === selectedTheme;
    node.dataset.active = isActive ? "true" : "false";
    node.setAttribute("aria-pressed", `${isActive}`);
  }
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
  if (requestField.getAttribute("aria-invalid") === "true") {
    requestField.removeAttribute("aria-invalid");
    setStatus("");
  }
}

async function onSubmit(event) {
  event.preventDefault();

  setStatus("");
  submitButton.disabled = true;
  submitButton.textContent = "Sending...";

  const formData = new FormData(form);
  const request = `${formData.get("request") ?? ""}`.trim();
  const website = `${formData.get("website") ?? ""}`;
  const scopePreference = `${formData.get("scopePreference") ?? "auto"}`;
  const validationError = validateRequest(request);

  if (validationError) {
    setStatus(validationError, "error");
    requestField.setAttribute("aria-invalid", "true");
    requestField.focus();
    submitButton.disabled = false;
    submitButton.textContent = SUBMIT_BUTTON_LABEL;
    return;
  }

  const payload = buildPayload(request, website, scopePreference);

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
    requestField.removeAttribute("aria-invalid");
    rememberSubmittedRequest({
      number: data.number,
      url: data.url || "",
      title: summarizeRequest(request),
      createdAt: new Date().toISOString(),
      githubUsername: supportSession.authenticated ? normalizeGitHubUsername(supportSession.login) : null,
      status: "queued",
      statusDetail: "Submitted from this browser. Waiting for the public queue to refresh.",
      statusUpdatedAt: new Date().toISOString(),
      commentCount: 0,
      commentUrl: data.url || ""
    });
    setStatus(`Request queued as issue #${data.number}. Added to My requests.`, "success");
    requestField.focus();
    await loadQueue(1);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Submission failed.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = SUBMIT_BUTTON_LABEL;
  }
}

function buildPayload(request, website, scopePreference = "auto") {
  const summary = summarizeRequest(request);

  return {
    website,
    summary,
    problem: request,
    outcome: `Ship the request described in Summary and Problem.\n\nRequested change:\n${request}`,
    constraints: "",
    successCriteria: "",
    notes: "",
    scopePreference: normalizeScopePreference(scopePreference)
  };
}

function normalizeScopePreference(value) {
  return ["auto", "25", "50", "75"].includes(value) ? value : "auto";
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

function validateRequest(request) {
  if (isLowSignalText(request)) {
    return "Describe the request in plain language instead of repeated or placeholder text.";
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
  const nearLimit = request.length > 1800;
  requestCountNode.style.color = nearLimit ? "var(--queue-rejected)" : "";
  requestCountNode.style.fontWeight = nearLimit ? "600" : "";
}

function loadMyRequests() {
  try {
    const raw = localStorage.getItem(MY_REQUESTS_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => item && Number.isInteger(item.number))
      .map(normalizeTrackedRequest)
      .filter(Boolean)
      .slice(0, MAX_MY_REQUESTS);
  } catch {
    return [];
  }
}

function persistMyRequests() {
  try {
    localStorage.setItem(MY_REQUESTS_STORAGE_KEY, JSON.stringify(myRequests.slice(0, MAX_MY_REQUESTS)));
  } catch {}
}

function normalizeTrackedRequest(item) {
  if (!item || !Number.isInteger(item.number)) {
    return null;
  }

  return {
    number: item.number,
    title: `${item.title || `Issue #${item.number}`}`.trim(),
    url: typeof item.url === "string" ? item.url : "",
    commentUrl: typeof item.commentUrl === "string" ? item.commentUrl : "",
    createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
    githubUsername: typeof item.githubUsername === "string" ? normalizeGitHubUsername(item.githubUsername) : null,
    status: normalizeTrackedStatus(item.status),
    statusDetail:
      typeof item.statusDetail === "string" && item.statusDetail.trim() ? item.statusDetail.trim() : null,
    statusUpdatedAt: typeof item.statusUpdatedAt === "string" ? item.statusUpdatedAt : null,
    commentCount: Number.isInteger(item.commentCount) ? item.commentCount : 0
  };
}

function normalizeTrackedStatus(value) {
  return ["queued", "needs-refinement", "in-progress", "complete", "rejected"].includes(value)
    ? value
    : "queued";
}

function rememberSubmittedRequest(item) {
  const normalized = normalizeTrackedRequest(item);

  if (!normalized) {
    return;
  }

  const existingIndex = myRequests.findIndex((entry) => entry.number === normalized.number);

  if (existingIndex >= 0) {
    myRequests.splice(existingIndex, 1);
  }

  myRequests.unshift(normalized);
  myRequests = myRequests.slice(0, MAX_MY_REQUESTS);
  persistMyRequests();
  renderMyRequests();
}

function syncMyRequestsWithQueue(items) {
  if (!myRequests.length) {
    renderMyRequests();
    return;
  }

  const byNumber = new Map(items.map((item) => [item.number, item]));
  let changed = false;

  myRequests = myRequests.map((item) => {
    const liveItem = byNumber.get(item.number);

    if (!liveItem) {
      return item;
    }

    changed = true;
    return normalizeTrackedRequest({
      ...item,
      ...liveItem,
      url: liveItem.url || item.url,
      commentUrl: liveItem.commentUrl || liveItem.url || item.commentUrl || item.url
    });
  });

  if (changed) {
    persistMyRequests();
  }

  renderMyRequests();
}

function renderMyRequests() {
  if (!myRequestsList || !myRequestsStatusNode) {
    return;
  }

  myRequestsList.innerHTML = "";

  if (!myRequests.length) {
    myRequestsStatusNode.textContent =
      "No saved requests in this browser yet. Submit one here and it will stay pinned for quick follow-up.";

    const empty = document.createElement("article");
    empty.className = "or-empty-card";
    empty.textContent =
      "Rejected requests can be clarified directly on GitHub once they appear here. No separate account or inbox yet.";
    myRequestsList.append(empty);
    return;
  }

  myRequestsStatusNode.textContent =
    `${myRequests.length} saved request${myRequests.length === 1 ? "" : "s"} in this browser.`;

  const fragment = document.createDocumentFragment();

  for (const item of myRequests) {
    const row = document.createElement("article");
    row.className = "block min-w-0 p-0 border-0 bg-transparent";
    row.append(createMyRequestCard(item));
    fragment.append(row);
  }

  myRequestsList.append(fragment);
}

function createMyRequestCard(item) {
  const card = document.createElement("div");
  card.className = "or-panel or-panel--tight h-full";

  const top = document.createElement("div");
  top.className = "flex items-center gap-2";

  const issue = document.createElement("span");
  issue.className = "text-xs font-semibold text-[var(--ink-faint)]";
  issue.textContent = `Issue #${item.number}`;

  const status = document.createElement("span");
  status.className = getStatusBadgeClasses(item.status);
  status.textContent = formatStatus(item.status);

  top.append(issue, status);

  const title = document.createElement("h3");
  title.className = "text-base leading-snug";
  title.textContent = item.title;

  const meta = document.createElement("div");
  meta.className = "flex items-baseline gap-1.5 flex-wrap";

  if (item.githubUsername) {
    const username = document.createElement("span");
    username.className = "text-[var(--accent-dark)] text-sm font-medium";
    username.textContent = formatGitHubUsername(item.githubUsername);
    meta.append(username);
  }

  const submittedAt = document.createElement("time");
  submittedAt.className = "text-sm text-[var(--ink-faint)]";
  submittedAt.dateTime = item.createdAt;
  submittedAt.title = item.createdAt;
  submittedAt.textContent = formatSubmissionTimestamp(item.createdAt);
  meta.append(submittedAt);

  const detail = document.createElement("p");
  detail.className = "text-[var(--ink-soft)] text-sm leading-relaxed";
  detail.textContent = getMyRequestDetail(item);

  const actions = document.createElement("div");
  actions.className = "flex flex-wrap gap-2.5";

  const primary = document.createElement("a");
  primary.className = CLS.pill;
  primary.href = item.commentUrl || item.url || "#";
  primary.target = "_blank";
  primary.rel = "noreferrer";
  primary.textContent =
    item.status === "rejected"
      ? "Reply on GitHub to clarify"
      : item.status === "needs-refinement"
        ? "Add detail on GitHub"
        : "Open on GitHub";

  if (!item.commentUrl && !item.url) {
    primary.setAttribute("aria-disabled", "true");
    primary.classList.add("opacity-50", "pointer-events-none");
  }

  actions.append(primary);

  card.append(top, title, meta, detail, actions);
  return card;
}

function getMyRequestDetail(item) {
  if (item.status === "rejected") {
    if (item.statusDetail) {
      return `${item.statusDetail} Reply on GitHub with the context the agent asked for or a narrower follow-up.`;
    }

    return "This request was rejected. Open the GitHub issue to read the rejection note and reply with clarification there.";
  }

  if (item.statusDetail) {
    return item.statusDetail;
  }

  if (item.status === "complete") {
    return "This request shipped or the linked pull request merged.";
  }

  if (item.status === "needs-refinement") {
    return "OpenReactor deferred this request until the GitHub thread has clearer scope or more detail.";
  }

  if (item.status === "in-progress") {
    return "An agent is actively reviewing or shipping this request.";
  }

  return "Waiting in the public queue.";
}

function setStatus(message, tone) {
  statusNode.textContent = message;
  statusNode.className = "min-h-6 text-sm leading-normal";
  if (tone === "success") statusNode.style.color = "var(--queue-complete)";
  else if (tone === "error") statusNode.style.color = "var(--queue-rejected)";
  else statusNode.style.color = "";
}

function renderSupportSession() {
  if (!authSignInNode || !authUserMenuNode) {
    return;
  }

  if (supportSession.authenticated && supportSession.login) {
    authSignInNode.hidden = true;
    authUserMenuNode.hidden = false;
    if (authAvatarNode) {
      authAvatarNode.src = `https://github.com/${encodeURIComponent(supportSession.login)}.png?size=48`;
      authAvatarNode.alt = `@${supportSession.login}`;
    }
    if (authLoginNode) {
      authLoginNode.textContent = supportSession.login;
    }
    if (authProfileLink) {
      authProfileLink.href = supportSession.profileUrl || `https://github.com/${encodeURIComponent(supportSession.login)}`;
    }
    return;
  }

  authUserMenuNode.hidden = true;
  if (supportSession.authAvailable) {
    authSignInNode.hidden = false;
    authSignInNode.href = buildSupportAuthUrl();
  } else {
    authSignInNode.hidden = true;
  }
}

function toggleAuthDropdown() {
  if (!authDropdownNode || !authUserButton) return;
  const open = authDropdownNode.hidden;
  authDropdownNode.hidden = !open;
  authUserButton.setAttribute("aria-expanded", String(open));
}

function closeAuthDropdown() {
  if (!authDropdownNode || !authUserButton) return;
  authDropdownNode.hidden = true;
  authUserButton.setAttribute("aria-expanded", "false");
}

function buildSupportAuthUrl() {
  const returnTo = `${window.location.pathname}${window.location.search}`;
  return `/api/auth/github?returnTo=${encodeURIComponent(returnTo)}`;
}

async function onSupportSignOut() {
  await fetch("/api/session", {
    method: "DELETE",
    credentials: "same-origin"
  });
  window.location.assign(`${window.location.pathname}${window.location.search}`);
}

function announceSupportSessionResult() {
  const url = new URL(window.location.href);
  const supportStatus = url.searchParams.get("support");

  if (!supportStatus) {
    return;
  }

  if (supportStatus === "connected") {
    setQueueStatus("GitHub sign-in connected. You can now support issues from the website.");
  } else if (supportStatus === "auth-error") {
    setQueueStatus("GitHub sign-in did not complete. Try again or support directly on GitHub.", "error");
  } else if (supportStatus === "auth-unavailable") {
    setQueueStatus("Website sign-in is not configured yet. Support directly on GitHub for now.", "error");
  }

  url.searchParams.delete("support");
  window.history.replaceState({}, "", url);
}

function setupReactorle() {
  if (!reactorleBoard || !reactorleKeyboard || !reactorleStatusNode) {
    return;
  }

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
    row.className = "grid grid-cols-5 gap-1.5";
    row.setAttribute("role", "row");
    const guess = getReactorleDisplayGuess(rowIndex);
    const evaluation =
      rowIndex < reactorleState.guesses.length
        ? evaluateGuess(reactorleState.guesses[rowIndex], reactorleState.answer)
        : [];

    for (let columnIndex = 0; columnIndex < REACTORLE_WORD_LENGTH; columnIndex += 1) {
      const tile = document.createElement("div");
      tile.setAttribute("role", "gridcell");
      tile.textContent = guess[columnIndex] ? guess[columnIndex].toUpperCase() : "";

      const tileStatus = evaluation[columnIndex];
      let state = "empty";
      if (tileStatus) {
        state = tileStatus;
      } else if (
        rowIndex === reactorleState.guesses.length &&
        columnIndex < reactorleState.currentGuess.length
      ) {
        state = "active";
      }
      tile.className = getReactorleTileClasses(state);
      tile.dataset.state = state;

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
    row.className = "grid grid-cols-10 gap-1.5";

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
  button.className = getReactorleKeyClasses(state);
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
    queueActiveItems = [];
    queueArchivedItems = [];
    queueState.archiveTotal = 0;
    renderQueueView();
  }

  syncQueueControls({
    page,
    hasPreviousPage: page > 1,
    hasNextPage: false
  });

  try {
    const headers = queueEtag ? { "If-None-Match": queueEtag } : {};
    const response = await fetch(buildQueueUrl(page), {
      headers,
      cache: "no-store"
    });

    if (response.status === 304) {
      markQueueRefresh();
      refreshQueueStatusCopy(queueActiveItems, page, queueState.archiveTotal);
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

async function loadOpenReactorStatus(options = {}) {
  const { silent = false } = options;

  if (!silent) {
    setOpenReactorLiveStatus("Loading live OpenReactor metadata...");
  }

  try {
    const response = await fetch("/api/openreactor-status", {
      cache: "no-store"
    });
    const data = await readJsonResponse(response, "openreactor-status");

    if (!response.ok) {
      throw new Error(data.error || "Unable to load live OpenReactor metadata.");
    }

    renderOpenReactorStatus(data);
  } catch (error) {
    renderOpenReactorStatusError(
      error instanceof Error ? error.message : "Unable to load live OpenReactor metadata."
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

function renderOpenReactorStatus(data) {
  markOpenReactorRefresh();

  openReactorStatus = {
    available: Boolean(data.available),
    services: data.services || {
      reactor: null,
      watchdog: null
    },
    agents: data.agents || {
      activeCount: 0,
      pendingRetryCount: 0,
      maxConcurrentIssues: 0,
      items: []
    },
    blockers: data.blockers || {
      pausedCount: 0,
      pausedIssues: [],
      maintainerHandoffCount: 0,
      maintainerHandoffs: []
    },
    pipeline: data.pipeline || null
  };

  renderPipeline();
  renderOpenReactorLivePanels();
}

function renderOpenReactorStatusError(message) {
  openReactorStatus = {
    available: false,
    services: {
      reactor: null,
      watchdog: null
    },
    agents: {
      activeCount: 0,
      pendingRetryCount: 0,
      maxConcurrentIssues: 0,
      items: []
    },
    blockers: {
      pausedCount: 0,
      pausedIssues: [],
      maintainerHandoffCount: 0,
      maintainerHandoffs: []
    },
    pipeline: null
  };

  renderPipeline();
  renderOpenReactorLivePanels();
  setOpenReactorLiveStatus(message, "error");
}

function renderQueue(data) {
  const activeItems = Array.isArray(data.activeItems) ? data.activeItems : [];
  const archivedItems = Array.isArray(data.archivedItems) ? data.archivedItems : [];
  const trackedItems = Array.isArray(data.trackedItems) ? data.trackedItems : [];
  const page = Number.isInteger(data.archivePage)
    ? data.archivePage
    : Number.isInteger(data.page)
      ? data.page
      : 1;
  const hasPreviousPage = Boolean(data.archiveHasPreviousPage ?? data.hasPreviousPage);
  const hasNextPage = Boolean(data.archiveHasNextPage ?? data.hasNextPage);
  const archiveTotal = Number.isFinite(data.archiveTotal) ? data.archiveTotal : archivedItems.length;
  const repoUrl = data.repoUrl || "";

  markQueueRefresh();
  queueActiveItems = activeItems;
  queueArchivedItems = archivedItems;
  const items = activeItems.concat(archivedItems, trackedItems);
  queueState.page = page;
  queueState.hasPreviousPage = hasPreviousPage;
  queueState.hasNextPage = hasNextPage;
  queueState.archiveTotal = archiveTotal;
  syncMyRequestsWithQueue(items);
  updateQueueLocation(page);
  syncQueueControls({ page, hasPreviousPage, hasNextPage, archiveTotal });

  if (repoUrl) {
    renderRepoStarLink(repoUrl);
    queueRepoLink.href = repoUrl;
    queueRepoLink.hidden = false;
  } else {
    queueRepoLink.hidden = true;
    queueRepoLink.removeAttribute("href");
  }

  renderQueueView();

  if (!activeItems.length && !archivedItems.length) {
    setQueueStatus("No requests yet.");
    setQueueRefreshNote(
      `Last checked ${formatRelativeRefreshTime(lastQueueRefreshAt)}. Auto-refreshes every ${formatPollInterval()}.`
    );
    return;
  }

  refreshQueueStatusCopy(activeItems, page, archiveTotal);
}

function renderQueueError(message) {
  queueActiveItems = [];
  queueArchivedItems = [];
  queueState.archiveTotal = 0;
  renderQueueView();
  queueRepoLink.hidden = true;
  queueRepoLink.removeAttribute("href");
  syncQueueControls({
    page: queueState.page,
    hasPreviousPage: queueState.hasPreviousPage,
    hasNextPage: queueState.hasNextPage,
    archiveTotal: queueState.archiveTotal
  });
  setQueueStatus(`${message} See GitHub directly if needed.`, "error");
  setQueueRefreshNote(`Auto-refresh retries every ${formatPollInterval()}.`);
}

function buildQueueUrl(page) {
  const url = new URL("/api/requests", window.location.origin);
  url.searchParams.set("page", `${page}`);

  const trackedIssueNumbers = myRequests
    .map((item) => item.number)
    .filter((number, index, all) => Number.isInteger(number) && all.indexOf(number) === index);

  if (trackedIssueNumbers.length) {
    url.searchParams.set("tracked", trackedIssueNumbers.join(","));
  }

  return `${url.pathname}${url.search}`;
}

function renderLeaderboard(items, totals) {
  leaderboardList.innerHTML = "";
  leaderboardStatsNode.setAttribute("aria-busy", "false");
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
    "Ranks credited GitHub usernames for merged pull requests in this repository.";
  const fragment = document.createDocumentFragment();

  for (const [index, item] of items.entries()) {
    const row = document.createElement("li");
    row.className = "or-panel or-panel--tight grid-cols-[auto_minmax(0,1fr)]";

    const rank = document.createElement("span");
    rank.className = "or-rank-badge";
    rank.textContent = `#${index + 1}`;

    const body = document.createElement("div");
    body.className = "grid gap-1.5 min-w-0";

    const top = document.createElement("div");
    top.className = "flex items-center justify-between gap-3 max-md:flex-col max-md:items-stretch";

    const profile = document.createElement("a");
    profile.className = "min-w-0 text-base font-semibold no-underline hover:text-[var(--accent-dark)]";
    profile.href = item.profileUrl;
    profile.target = "_blank";
    profile.rel = "noreferrer";
    profile.textContent = `@${item.login}`;

    const badge = document.createElement("span");
    badge.className = "or-badge or-badge--neutral";
    badge.textContent =
      item.creditSource === "issue-requester"
        ? "Requester"
        : item.accountType === "Bot"
          ? "Bot"
          : "Account";

    top.append(profile, badge);

    const count = document.createElement("p");
    count.className = "text-[var(--ink-soft)] text-sm leading-snug";
    count.textContent = `${item.mergedCount} merged PR${item.mergedCount === 1 ? "" : "s"}`;

    const latest = document.createElement("a");
    latest.className = "min-w-0 overflow-hidden text-[var(--accent-dark)] text-sm font-medium leading-snug no-underline text-ellipsis whitespace-nowrap max-md:whitespace-normal hover:text-[var(--accent)]";
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
  leaderboardStatsNode.setAttribute("aria-busy", "false");
  leaderboardSummaryNode.textContent = "Contributor data unavailable right now.";
  leaderboardTotalPrsNode.textContent = "\u2014";
  leaderboardTotalAuthorsNode.textContent = "\u2014";
  leaderboardLatestMergeNode.textContent = "Unavailable";
  setLeaderboardStatus(`${message} Try again later.`, "error");
}

function renderPipeline() {
  if (!openReactorPipelineNode) return;

  const pipeline = openReactorStatus.pipeline;
  const stages = Array.isArray(pipeline?.stages) ? pipeline.stages : [];

  if (!stages.length) {
    openReactorPipelineNode.innerHTML = "";
    const empty = document.createElement("p");
    empty.className = "text-sm text-[var(--ink-faint)]";
    empty.textContent = "Pipeline stages will appear when the status API responds.";
    openReactorPipelineNode.append(empty);
    return;
  }

  openReactorPipelineNode.innerHTML = "";
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const items = Array.isArray(stage.items) ? stage.items : [];
    const isAvailable = Boolean(stage.available);
    const hasItems = stage.itemCount > 0 || items.length > 0;
    const count = stage.itemCount ?? items.length;

    const card = document.createElement("div");
    card.className = "or-pipeline-stage" + (isAvailable ? "" : " or-pipeline-stage--offline") + (hasItems && isAvailable ? " or-pipeline-stage--active" : "");

    const header = document.createElement("div");
    header.className = "flex items-center justify-between gap-2";

    const label = document.createElement("span");
    label.className = "text-xs font-medium tracking-wide uppercase" + (isAvailable ? " text-[var(--ink-soft)]" : " text-[var(--ink-faint)]");
    label.textContent = stage.label || stage.key;

    const badge = document.createElement("span");
    badge.className = "or-count-chip" + (hasItems && isAvailable ? " or-count-chip--accent" : "");
    badge.textContent = `${count}`;

    header.append(label, badge);
    card.append(header);

    if (!isAvailable && stage.error) {
      const err = document.createElement("p");
      err.className = "text-xs text-[var(--ink-faint)] mt-1 leading-snug";
      err.textContent = "Offline";
      card.append(err);
    } else if (isAvailable && items.length > 0) {
      const list = document.createElement("ul");
      list.className = "or-pipeline-items";
      const visible = items.slice(0, 3);
      for (const item of visible) {
        const li = document.createElement("li");
        li.className = "or-pipeline-item";
        if (item.issueUrl) {
          const link = document.createElement("a");
          link.className = "or-pipeline-item-link";
          link.href = item.issueUrl;
          link.target = "_blank";
          link.rel = "noreferrer";
          link.textContent = item.issueTitle
            ? `#${item.issueNumber} ${item.issueTitle}`
            : `#${item.issueNumber}`;
          li.append(link);
        } else {
          li.textContent = item.issueTitle || item.issueNumber || "Item";
        }
        list.append(li);
      }
      if (items.length > 3) {
        const more = document.createElement("li");
        more.className = "text-xs text-[var(--ink-faint)]";
        more.textContent = `+${items.length - 3} more`;
        list.append(more);
      }
      card.append(list);
    } else if (isAvailable && count === 0) {
      const empty = document.createElement("p");
      empty.className = "text-xs text-[var(--ink-faint)] mt-1";
      empty.textContent = "Empty";
      card.append(empty);
    }

    fragment.append(card);
  }

  openReactorPipelineNode.append(fragment);
}

function renderOpenReactorLivePanels() {
  if (!openReactorLiveAgentsNode || !openReactorLiveBlockersNode) {
    return;
  }

  const reactorService = openReactorStatus.services.reactor;
  const watchdogService = openReactorStatus.services.watchdog;
  const activeAgents = Array.isArray(openReactorStatus.agents.items)
    ? openReactorStatus.agents.items
    : [];
  const maintainerHandoffs = Array.isArray(openReactorStatus.blockers.maintainerHandoffs)
    ? openReactorStatus.blockers.maintainerHandoffs
    : [];
  const pausedIssues = Array.isArray(openReactorStatus.blockers.pausedIssues)
    ? openReactorStatus.blockers.pausedIssues
    : [];
  const blockedCount = maintainerHandoffs.length + pausedIssues.length;

  openReactorLiveReactorNode.textContent = formatServiceSummary(reactorService);
  openReactorLiveWatchdogNode.textContent = formatServiceSummary(watchdogService);
  openReactorLiveActiveNode.textContent = `${activeAgents.length}`;
  openReactorLiveBlockedNode.textContent = `${blockedCount}`;
  openReactorLiveRefreshNode.textContent = lastOpenReactorRefreshAt
    ? `Updated ${formatRelativeRefreshTime(lastOpenReactorRefreshAt)}`
    : "Waiting for the first status update...";

  if (!openReactorStatus.available) {
    setOpenReactorLiveStatus("Live OpenReactor metadata is not connected yet.", "error");
  } else if (!activeAgents.length && !blockedCount) {
    setOpenReactorLiveStatus("OpenReactor is idle right now. No agents are actively working or blocked.");
  } else {
    setOpenReactorLiveStatus(
      `OpenReactor has ${activeAgents.length} active agent${activeAgents.length === 1 ? "" : "s"} and ${blockedCount} blocked item${blockedCount === 1 ? "" : "s"}.`
    );
  }

  openReactorLiveAgentsNode.innerHTML = "";
  if (!activeAgents.length) {
    openReactorLiveAgentsNode.append(createOpenReactorEmptyState("No active agents right now."));
  } else {
    const fragment = document.createDocumentFragment();
    for (const item of activeAgents) {
      fragment.append(createOpenReactorAgentCard(item));
    }
    openReactorLiveAgentsNode.append(fragment);
  }

  openReactorLiveBlockersNode.innerHTML = "";
  if (!maintainerHandoffs.length && !pausedIssues.length) {
    openReactorLiveBlockersNode.append(createOpenReactorEmptyState("Nothing is currently blocked."));
  } else {
    const fragment = document.createDocumentFragment();
    for (const handoff of maintainerHandoffs) {
      fragment.append(createOpenReactorBlockerCard(handoff, "Maintainer action"));
    }
    for (const paused of pausedIssues) {
      fragment.append(createOpenReactorBlockerCard(paused, "Paused"));
    }
    openReactorLiveBlockersNode.append(fragment);
  }
}

function createOpenReactorAgentCard(item) {
  const row = document.createElement("li");
  row.className = "or-panel or-panel--tight grid gap-2";

  const top = document.createElement("div");
  top.className = "flex items-start justify-between gap-3 max-md:flex-col max-md:items-stretch";

  const titleLink = document.createElement("a");
  titleLink.className = "text-base font-semibold no-underline hover:text-[var(--accent-dark)]";
  titleLink.href = item.issueUrl;
  titleLink.target = "_blank";
  titleLink.rel = "noreferrer";
  titleLink.textContent = `#${item.issueNumber} ${item.issueTitle}`;

  const badge = document.createElement("span");
  badge.className = "or-badge or-badge--neutral";
  badge.textContent = item.toolLabel || item.toolName || "Agent";

  top.append(titleLink, badge);

  const meta = document.createElement("p");
  meta.className = "text-sm leading-snug text-[var(--ink-soft)]";
  meta.textContent = [
    item.provider ? `${item.provider}` : "",
    item.primaryUse ? `${item.primaryUse}` : "",
    item.iteration ? `iteration ${item.iteration}` : "",
    item.branchName ? item.branchName : ""
  ]
    .filter(Boolean)
    .join(" • ");

  const timing = document.createElement("p");
  timing.className = "text-xs font-medium tracking-wide uppercase text-[var(--ink-faint)]";
  timing.textContent = item.lastHeartbeatAt
    ? `Heartbeat ${formatIsoTimestamp(item.lastHeartbeatAt)}`
    : "Heartbeat unavailable";

  row.append(top, meta, timing);
  return row;
}

function createOpenReactorBlockerCard(item, label) {
  const row = document.createElement("li");
  row.className = "or-panel or-panel--tight grid gap-2";

  const heading = document.createElement("div");
  heading.className = "flex items-start justify-between gap-3 max-md:flex-col max-md:items-stretch";

  const title = document.createElement("span");
  title.className = "text-base font-semibold";
  title.textContent =
    item.issueNumber && item.issueUrl
      ? `#${item.issueNumber}`
      : label;

  if (item.issueUrl) {
    const link = document.createElement("a");
    link.className = "text-base font-semibold no-underline hover:text-[var(--accent-dark)]";
    link.href = item.issueUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent =
      item.issueTitle ? `#${item.issueNumber} ${item.issueTitle}` : `#${item.issueNumber}`;
    heading.append(link);
  } else {
    heading.append(title);
  }

  const badge = document.createElement("span");
  badge.className = "or-badge or-badge--neutral";
  badge.textContent = label;
  heading.append(badge);

  const detail = document.createElement("p");
  detail.className = "text-sm leading-relaxed text-[var(--ink-soft)]";
  detail.textContent =
    item.instructions ||
    item.lastFailureClass ||
    "OpenReactor is waiting before this item can move again.";

  const meta = document.createElement("p");
  meta.className = "text-xs font-medium tracking-wide uppercase text-[var(--ink-faint)]";
  meta.textContent = [
    item.prUrl ? `PR linked` : "",
    item.autoHealAttempts ? `${item.autoHealAttempts} auto-heal attempts` : "",
    item.repairIssueNumber ? `repair #${item.repairIssueNumber}` : "",
    item.updatedAt ? `updated ${formatIsoTimestamp(item.updatedAt)}` : "",
    item.lastEscalatedAt ? `escalated ${formatIsoTimestamp(item.lastEscalatedAt)}` : ""
  ]
    .filter(Boolean)
    .join(" • ") || "Blocked item";

  row.append(heading, detail, meta);
  return row;
}

function createOpenReactorEmptyState(message) {
  const row = document.createElement("li");
  row.className = "or-empty-card";
  row.textContent = message;
  return row;
}

function setQueueStatus(message, tone) {
  queueStatusNode.textContent = message;
  queueStatusNode.style.color = tone === "error" ? "var(--queue-rejected)" : "";
}

function setLeaderboardStatus(message, tone) {
  leaderboardStatusNode.textContent = message;
  leaderboardStatusNode.style.color = tone === "error" ? "var(--queue-rejected)" : "";
}

function setOpenReactorLiveStatus(message, tone) {
  if (!openReactorLiveStatusNode) {
    return;
  }

  openReactorLiveStatusNode.textContent = message;
  openReactorLiveStatusNode.style.color = tone === "error" ? "var(--queue-rejected)" : "";
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

function startOpenReactorStatusPolling() {
  stopOpenReactorStatusPolling();
  openReactorStatusTimer = window.setInterval(() => {
    if (document.visibilityState !== "visible") {
      return;
    }

    void loadOpenReactorStatus({ silent: true });
  }, OPENREACTOR_STATUS_POLL_INTERVAL_MS);
}

function stopOpenReactorStatusPolling() {
  if (!openReactorStatusTimer) {
    return;
  }

  window.clearInterval(openReactorStatusTimer);
  openReactorStatusTimer = 0;
}

function onVisibilityChange() {
  if (document.visibilityState !== "visible") {
    return;
  }

  void checkForDeployUpdate();

  if (Date.now() - lastQueueRefreshAt >= QUEUE_POLL_INTERVAL_MS) {
    void loadQueue(queueState.page, { silent: true });
  }

  if (Date.now() - lastOpenReactorRefreshAt >= OPENREACTOR_STATUS_POLL_INTERVAL_MS) {
    void loadOpenReactorStatus({ silent: true });
  }
}

function refreshQueueStatusCopy(
  activeItems = queueActiveItems,
  page = queueState.page,
  archiveTotal = queueState.archiveTotal
) {
  const countLabel = formatQueueCountLabel(activeItems.length, archiveTotal);
  const freshnessLabel = lastQueueRefreshAt
    ? `Last checked ${formatRelativeRefreshTime(lastQueueRefreshAt)}.`
    : "Waiting for the first refresh.";
  const archiveLabel = archiveTotal ? ` Archive page ${page}.` : "";
  setQueueStatus(`${countLabel}${archiveLabel} Auto-refreshes every ${formatPollInterval()}.`);
  setQueueRefreshNote(freshnessLabel);
}

function markQueueRefresh() {
  lastQueueRefreshAt = Date.now();
}

function markOpenReactorRefresh() {
  lastOpenReactorRefreshAt = Date.now();
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

  renderQueueBoard(queueActiveItems);
  renderQueueTable(queueActiveItems);
  renderQueueArchive(queueArchivedItems, queueState.archiveTotal);
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
    const columnItems = groupedItems.get(column.key) || [];
    lane.className = "or-panel or-panel--tight min-w-0 content-start";

    const header = document.createElement("div");
    header.className = "flex items-center justify-between gap-3 px-0.5";

    const titleBlock = document.createElement("div");
    titleBlock.className = "flex items-baseline gap-2";

    const heading = document.createElement("h3");
    heading.className = "or-section-eyebrow";
    heading.textContent = column.label;

    titleBlock.append(heading);

    const count = document.createElement("span");
    count.className = "or-count-chip";
    count.textContent = String(groupedItems.get(column.key)?.length || 0);

    header.append(titleBlock, count);

    const list = document.createElement("ul");
    list.className = "grid gap-2 list-none m-0 p-0";

    if (!columnItems.length) {
      const empty = document.createElement("li");
      empty.className = "or-empty-card text-center";
      empty.textContent = "No requests here yet.";
      list.append(empty);
    } else {
      for (const item of columnItems) {
        const row = document.createElement("li");
        row.className = "block";
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
    row.className = "transition-colors hover:bg-[rgba(0,0,0,0.04)]";

    const issueCell = document.createElement("td");
    issueCell.className = "p-[0.7rem_1rem] text-left border-b border-[var(--line)] whitespace-nowrap font-mono text-xs font-semibold tracking-wide uppercase text-[var(--ink-faint)]";
    issueCell.textContent = `#${item.number}`;

    const titleCell = document.createElement("td");
    titleCell.className = "p-[0.7rem_1rem] text-left border-b border-[var(--line)]";
    const titleLink = document.createElement("a");
    titleLink.className = "text-inherit no-underline";
    titleLink.href = item.commentUrl || item.url;
    titleLink.target = "_blank";
    titleLink.rel = "noreferrer";
    titleLink.textContent = item.title;
    titleCell.append(titleLink);

    const statusCell = document.createElement("td");
    statusCell.className = "p-[0.7rem_1rem] text-left border-b border-[var(--line)] whitespace-nowrap";
    const status = document.createElement("span");
    status.className = getStatusBadgeClasses(item.status);
    status.textContent = formatStatus(item.status);
    statusCell.append(status);

    const submittedCell = document.createElement("td");
    submittedCell.className = "p-[0.7rem_1rem] text-left border-b border-[var(--line)]";
    const submittedTime = document.createElement("time");
    submittedTime.className = "text-[var(--ink-faint)] text-sm whitespace-nowrap";
    submittedTime.dateTime = item.createdAt;
    submittedTime.title = item.createdAt;
    const queueDetail = formatQueueDetail(item.statusDetail, item.statusUpdatedAt);
    submittedTime.textContent = queueDetail || formatShortDate(item.createdAt);
    submittedCell.append(submittedTime);

    const supportCell = document.createElement("td");
    supportCell.className = "p-[0.7rem_1rem] text-left border-b border-[var(--line)]";
    supportCell.append(createSupportControls(item, "compact"));

    row.append(issueCell, titleCell, statusCell, submittedCell, supportCell);
    fragment.append(row);
  }

  queueTableBody.append(fragment);
}

function renderQueueArchive(items, total = items.length) {
  const wasOpen = queueArchive.open;
  queueArchiveList.innerHTML = "";
  queueArchive.hidden = true;
  queueArchive.removeAttribute("open");
  queueArchivePagination.hidden = true;

  if (!total) {
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const item of items) {
    const row = document.createElement("li");
    row.className = "border-b border-[var(--line)] last:border-b-0";

    const link = document.createElement("a");
    link.className = "grid grid-cols-[auto_1fr_auto] items-center gap-3 p-3 px-4 text-inherit no-underline transition-colors hover:bg-[rgba(0,0,0,0.04)]";
    link.href = item.commentUrl || item.url;
    link.target = "_blank";
    link.rel = "noreferrer";

    const issue = document.createElement("span");
    issue.className = "text-sm font-semibold text-[var(--ink-faint)] min-w-14";
    issue.textContent = `#${item.number}`;

    const title = document.createElement("span");
    title.className = "text-[0.95rem] leading-snug whitespace-nowrap overflow-hidden text-ellipsis";
    title.textContent = item.title;

    const statusWrap = document.createElement("span");
    statusWrap.className = "inline-flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase whitespace-nowrap";
    statusWrap.style.color = getArchiveStatusColor(item.status);

    const dot = document.createElement("span");
    dot.className = "w-1.5 h-1.5 rounded-full shrink-0";
    dot.style.background = getArchiveDotColor(item.status);

    const statusLabel = document.createElement("span");
    statusLabel.textContent = formatStatus(item.status);

    statusWrap.append(dot, statusLabel);
    link.append(issue, title, statusWrap);
    row.append(link);
    fragment.append(row);
  }

  queueArchive.hidden = false;
  queueArchiveCountNode.textContent = `${total} request${total === 1 ? "" : "s"}`;
  queueArchiveList.append(fragment);
  queueArchivePagination.hidden = false;

  if (wasOpen || queueState.page > 1) {
    queueArchive.open = true;
  }
}

function createQueueCardLink(item) {
  const card = document.createElement("article");
  card.className = "grid gap-3";
  const link = document.createElement("a");
  link.className = "or-panel or-panel--tight or-panel--interactive h-full text-inherit no-underline";
  link.href = item.commentUrl || item.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.style.borderLeft = `3px solid ${getStatusBorderColor(item.status)}`;

  const top = document.createElement("div");
  top.className = "flex items-center gap-2";

  const title = document.createElement("span");
  title.className = "text-base leading-snug";
  title.textContent = item.title;

  const meta = document.createElement("div");
  meta.className = "flex items-baseline gap-1.5 flex-wrap";

  const issue = document.createElement("span");
  issue.className = "text-xs font-semibold text-[var(--ink-faint)]";
  issue.textContent = `Issue #${item.number}`;

  const status = document.createElement("span");
  status.className = getStatusBadgeClasses(item.status);
  status.textContent = formatStatus(item.status);

  top.append(issue, status);

  if (item.githubUsername) {
    const username = document.createElement("span");
    username.className = "text-[var(--accent-dark)] text-sm font-medium";
    username.textContent = formatGitHubUsername(item.githubUsername);
    meta.append(username);
  }

  const submittedAt = document.createElement("time");
  submittedAt.className = "text-sm text-[var(--ink-faint)]";
  submittedAt.dateTime = item.createdAt;
  submittedAt.title = item.createdAt;
  submittedAt.textContent = formatSubmissionTimestamp(item.createdAt);
  meta.append(submittedAt);

  const discussion = document.createElement("div");
  discussion.className = "flex items-baseline gap-1 text-[0.82rem] text-[var(--ink-faint)]";

  const commentCount = document.createElement("span");
  commentCount.className = "font-semibold";
  commentCount.textContent = formatCommentCount(item.commentCount);

  const commentHint = document.createElement("span");
  commentHint.textContent = getQueueDiscussionHint(item);

  discussion.append(commentCount, commentHint);

  const cta = document.createElement("span");
  cta.className = "text-[var(--accent-dark)] text-sm font-medium";
  cta.textContent =
    item.status === "rejected"
      ? "Read the rejection and reply on GitHub"
      : item.status === "needs-refinement"
        ? "Open issue and add the missing detail on GitHub"
        : "Open issue and comment on GitHub";

  link.append(top, title, meta, discussion, cta);
  card.append(link, createSupportControls(item));
  return card;
}

function createSupportControls(item, mode = "default") {
  const wrapper = document.createElement("div");
  wrapper.className = mode === "compact"
    ? "flex items-center"
    : "flex items-center pt-0.5";

  wrapper.append(buildUpvoteButton(item));
  return wrapper;
}

function buildUpvoteButton(item) {
  const count = Number.isFinite(item.supportCount) ? Math.max(0, item.supportCount) : 0;
  const thumbSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>';

  if (item.viewerSupports) {
    const el = document.createElement("span");
    el.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border border-[rgba(32,116,90,0.25)] bg-[rgba(32,116,90,0.08)] text-[var(--queue-complete)] cursor-default select-none";
    el.innerHTML = thumbSvg;
    el.append(` ${count}`);
    el.title = "You've supported this issue";
    return el;
  }

  if (supportSession.authenticated) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border border-[var(--line)] text-[var(--ink-faint)] cursor-pointer select-none transition-colors hover:text-[var(--ink)] hover:border-[var(--ink-faint)]";
    button.innerHTML = thumbSvg;
    button.append(` ${count}`);
    button.title = "Support this issue on GitHub";
    button.addEventListener("click", () => {
      void handleUpvoteAction(item.number, button);
    });
    return button;
  }

  // Not signed in — grayed out with tooltip
  if (supportSession.authAvailable) {
    const link = document.createElement("a");
    link.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border border-[var(--line)] text-[var(--ink-faint)] opacity-50 cursor-pointer select-none transition-colors hover:opacity-75";
    link.innerHTML = thumbSvg;
    link.append(` ${count}`);
    link.title = "Sign in to GitHub to upvote";
    link.href = buildSupportAuthUrl();
    link.target = "_self";
    return link;
  }

  // Auth not available — link to GitHub issue
  const link = document.createElement("a");
  link.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border border-[var(--line)] text-[var(--ink-faint)] opacity-50 select-none";
  link.innerHTML = thumbSvg;
  link.append(` ${count}`);
  link.title = "Support on GitHub directly";
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  return link;
}

function isArchivedQueueItem(item) {
  return item.status === "complete" || item.status === "rejected";
}

function formatQueueCountLabel(activeCount, archivedCount) {
  const activeLabel = `${activeCount} active request${activeCount === 1 ? "" : "s"}.`;

  if (!archivedCount) {
    return activeLabel;
  }

  return `${activeLabel} ${archivedCount} archived.`;
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

function getQueueDiscussionHint(item) {
  if (item.status === "rejected") {
    if (item.statusDetail) {
      return `Rejected: ${item.statusDetail}`;
    }

    return "Rejected. Open the issue to read the reason and reply with clarification on GitHub.";
  }

  if (item.status === "needs-refinement") {
    if (item.statusDetail) {
      return `Needs refinement: ${item.statusDetail}`;
    }

    return "Needs refinement. Open the issue and add more detail on GitHub.";
  }

  return (
    formatQueueDetail(item.statusDetail, item.statusUpdatedAt) ||
    (item.commentCount > 0
      ? "Discussion already started on GitHub."
      : "Be the first to add context on GitHub.")
  );
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


function formatServiceSummary(service) {
  if (!service || !service.activeState) {
    return "Unknown";
  }

  if (service.active) {
    return "Running";
  }

  if (service.activeState === "activating") {
    return "Starting";
  }

  if (service.activeState === "failed") {
    return "Failed";
  }

  if (service.activeState === "inactive" || service.activeState === "deactivating") {
    return "Stopped";
  }

  return service.activeState;
}

function formatIsoTimestamp(value) {
  if (!value) {
    return "unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

async function handleUpvoteAction(issueNumber, button) {
  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.style.opacity = "0.5";

  try {
    const response = await fetch("/api/support", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "same-origin",
      body: JSON.stringify({ issueNumber })
    });
    const data = await readJsonResponse(response, "support");

    if (!response.ok) {
      throw new Error(data.error || "Unable to support this issue.");
    }

    syncQueueItemSupport(issueNumber, {
      supportCount: data.supportCount,
      viewerSupports: Boolean(data.viewerSupports)
    });
    setQueueStatus(`Support recorded on GitHub for issue #${issueNumber}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to support this issue.";
    setQueueStatus(message, "error");

    if (/sign in/i.test(message)) {
      supportSession.authenticated = false;
      renderSupportSession();
      renderQueueView();
    } else {
      button.disabled = false;
      button.style.opacity = "";
      button.innerHTML = originalHtml;
    }
  }
}

function syncQueueItemSupport(issueNumber, nextState) {
  const syncItem = (item) =>
    item.number === issueNumber
      ? {
          ...item,
          supportCount: Number.isFinite(nextState.supportCount) ? nextState.supportCount : item.supportCount,
          viewerSupports: Boolean(nextState.viewerSupports)
        }
      : item;

  queueActiveItems = queueActiveItems.map(syncItem);
  queueArchivedItems = queueArchivedItems.map(syncItem);
  renderQueueView();
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

function syncQueueControls({ page, hasPreviousPage, hasNextPage, archiveTotal = queueState.archiveTotal }) {
  queueState.page = page;
  queueState.hasPreviousPage = hasPreviousPage;
  queueState.hasNextPage = hasNextPage;
  queueState.archiveTotal = archiveTotal;
  queuePageLabelNode.textContent = `Archive page ${page}`;
  queueNewerButton.disabled = queueState.isLoading || !hasPreviousPage;
  queueOlderButton.disabled = queueState.isLoading || !hasNextPage;
  queueArchivePagination.hidden = archiveTotal === 0;
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

/* --- Snowfall animation (playground only) --- */

const SNOWFALL_STORAGE_KEY = "openreactor-snowfall";
const SNOWFALL_MAX_FLAKES = 35;
const SNOWFALL_SPAWN_INTERVAL_MS = 400;
const snowfallToggle = document.querySelector("#snowfall-toggle");

if (snowfallToggle) {
  let snowfallContainer = null;
  let snowfallTimer = null;
  const savedSnow = localStorage.getItem(SNOWFALL_STORAGE_KEY);
  const snowActive = savedSnow === "on";

  function spawnSnowflake() {
    if (!snowfallContainer) return;
    if (snowfallContainer.childElementCount >= SNOWFALL_MAX_FLAKES) return;

    const flake = document.createElement("div");
    flake.className = "snowflake";
    const size = 3 + Math.random() * 4;
    const left = Math.random() * 100;
    const duration = 6 + Math.random() * 6;
    const drift = -30 + Math.random() * 60;
    const opacity = 0.1 + Math.random() * 0.15;

    flake.style.width = `${size}px`;
    flake.style.height = `${size}px`;
    flake.style.left = `${left}%`;
    flake.style.animationDuration = `${duration}s`;
    flake.style.setProperty("--snow-drift", `${drift}px`);
    flake.style.setProperty("--snow-opacity", `${opacity}`);

    flake.addEventListener("animationend", () => flake.remove());
    snowfallContainer.appendChild(flake);
  }

  function startSnowfall() {
    if (snowfallContainer) return;
    snowfallContainer = document.createElement("div");
    snowfallContainer.className = "snowfall-container";
    snowfallContainer.setAttribute("aria-hidden", "true");
    document.body.appendChild(snowfallContainer);
    snowfallTimer = setInterval(spawnSnowflake, SNOWFALL_SPAWN_INTERVAL_MS);
  }

  function stopSnowfall() {
    if (snowfallTimer) {
      clearInterval(snowfallTimer);
      snowfallTimer = null;
    }
    if (snowfallContainer) {
      snowfallContainer.remove();
      snowfallContainer = null;
    }
  }

  function setSnowfall(on) {
    snowfallToggle.setAttribute("aria-pressed", on ? "true" : "false");
    if (on) {
      snowfallToggle.style.background = "var(--accent-muted)";
      snowfallToggle.style.color = "var(--accent-dark)";
      startSnowfall();
    } else {
      snowfallToggle.style.background = "";
      snowfallToggle.style.color = "";
      stopSnowfall();
    }
    localStorage.setItem(SNOWFALL_STORAGE_KEY, on ? "on" : "off");
  }

  snowfallToggle.addEventListener("click", () => {
    const isOn = snowfallToggle.getAttribute("aria-pressed") === "true";
    setSnowfall(!isOn);
  });

  if (snowActive) {
    setSnowfall(true);
  }
}
