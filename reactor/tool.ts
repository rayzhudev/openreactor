import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import net from "node:net";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config";
import { buildExecutionFooter, renderBodyWithExecutionFooter } from "./execution-footer";
import { initializeRepoState, REPO_STATE_DIR } from "./repo-state";

const execFileAsync = promisify(execFile);

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "ensure-plan") {
    await ensurePlan(rest);
    return;
  }

  if (command === "ensure-pr") {
    await ensurePr(rest);
    return;
  }

  if (command === "coauthor-trailer") {
    await printCoauthorTrailer(rest);
    return;
  }

  if (command === "init-repo-state") {
    await initRepoState(rest);
    return;
  }

  if (command === "start-instance") {
    await startInstance(rest);
    return;
  }

  throw new Error(`Unknown reactor tool command: ${command}`);
}

async function ensurePlan(args: string[]): Promise<void> {
  const issueNumber = requireNumberArg(args, "--issue");
  const issueTitle = requireStringArg(args, "--title");
  const branchName = requireStringArg(args, "--branch");
  const runDir = resolveRunDir(args);
  const planPath = path.join(runDir, "plan.json");

  let current: Record<string, unknown> = {};
  try {
    current = JSON.parse(await fs.readFile(planPath, "utf8")) as Record<string, unknown>;
  } catch {
    current = {};
  }

  const next = {
    issueNumber,
    issueTitle,
    branchName,
    decision: current.decision ?? "pending",
    productIntent: current.productIntent ?? "",
    chosenApproach: current.chosenApproach ?? "",
    acceptanceCriteria: Array.isArray(current.acceptanceCriteria) ? current.acceptanceCriteria : [],
    qualityChecks: Array.isArray(current.qualityChecks) ? current.qualityChecks : [],
    humanHandoff:
      typeof current.humanHandoff === "object" && current.humanHandoff !== null
        ? current.humanHandoff
        : {
            required: false,
            instructions: ""
          },
    updatedAt: new Date().toISOString()
  };

  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(planPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(planPath);
}

async function ensurePr(args: string[]): Promise<void> {
  const config = loadConfig();
  const issueNumber = requireNumberArg(args, "--issue");
  const branchName = requireStringArg(args, "--branch");
  const title = requireStringArg(args, "--title");
  const bodyFile = requireStringArg(args, "--body-file");
  const base = optionalStringArg(args, "--base") || "main";
  const cwd = optionalStringArg(args, "--cwd") || process.cwd();
  const autoMerge = !hasFlag(args, "--no-auto-merge");
  const mergeMethod = optionalStringArg(args, "--merge-method") || "squash";
  const token = resolveGitHubToken();
  const runDir = optionalRunDir(args);
  const bodyPath = path.resolve(cwd, bodyFile);
  const finalBodyPath = await preparePullRequestBody(bodyPath, runDir);

  await pushBranchWithToken({
    cwd,
    owner: config.owner,
    repo: config.repo,
    branchName,
    token
  });

  const { stdout: existingJson } = await execFileAsync(
    "gh",
    [
      "pr",
      "list",
      "--repo",
      `${config.owner}/${config.repo}`,
      "--head",
      branchName,
      "--state",
      "open",
      "--json",
      "number,url"
    ],
    {
      env: process.env
    }
  );

  const existing = JSON.parse(existingJson) as Array<{ number: number; url: string }>;
  if (existing[0]) {
    await execFileAsync(
      "gh",
      [
        "pr",
        "edit",
        String(existing[0].number),
        "--repo",
        `${config.owner}/${config.repo}`,
        "--title",
        title,
        "--body-file",
        finalBodyPath
      ],
      {
        env: process.env
      }
    );

    if (autoMerge) {
      await enableAutoMerge({
        owner: config.owner,
        repo: config.repo,
        prNumber: existing[0].number,
        mergeMethod
      });
    }

    console.log(
      JSON.stringify(
        {
          issueNumber,
          branchName,
          autoMergeEnabled: autoMerge,
          prNumber: existing[0].number,
          prUrl: existing[0].url
        },
        null,
        2
      )
    );
    return;
  }

  const { stdout: createdStdout } = await execFileAsync(
    "gh",
    [
      "pr",
      "create",
      "--repo",
      `${config.owner}/${config.repo}`,
      "--base",
      base,
      "--head",
      branchName,
      "--title",
      title,
      "--body-file",
      finalBodyPath
    ],
    {
      env: process.env
    }
  );

  const prNumber = await resolvePullRequestNumber(config.owner, config.repo, branchName);
  if (autoMerge) {
    await enableAutoMerge({
      owner: config.owner,
      repo: config.repo,
      prNumber,
      mergeMethod
    });
  }

  console.log(
    JSON.stringify(
      {
        issueNumber,
        branchName,
        autoMergeEnabled: autoMerge,
        prNumber,
        prUrl: createdStdout.trim()
      },
      null,
      2
    )
  );
}

async function printCoauthorTrailer(args: string[]): Promise<void> {
  const username = normalizeGitHubUsername(requireStringArg(args, "--username"));
  if (!isValidGitHubUsername(username)) {
    throw new Error(
      "GitHub username must be 1 to 39 characters using letters, numbers, or single hyphens."
    );
  }

  const user = await fetchGitHubUser(username, optionalGitHubToken());
  const displayName = (user.name ?? "").trim() || user.login;
  const email = `${user.id}+${user.login}@users.noreply.github.com`;

  console.log(`Co-authored-by: ${displayName} <${email}>`);
}

async function initRepoState(args: string[]): Promise<void> {
  const cwd = optionalStringArg(args, "--cwd") || process.cwd();
  const explicitName = optionalStringArg(args, "--repo-name");
  const repoName = explicitName || inferRepoDisplayName(cwd);
  const writtenPaths = await initializeRepoState(cwd, repoName);

  console.log(
    JSON.stringify(
      {
        repoRoot: cwd,
        repoStateDir: path.join(cwd, REPO_STATE_DIR),
        repoName,
        created: writtenPaths
      },
      null,
      2
    )
  );
}

async function startInstance(args: string[]): Promise<void> {
  const cwd = path.resolve(optionalStringArg(args, "--cwd") || process.cwd());
  const remote = inferGitHubRemote(cwd);
  const owner = optionalStringArg(args, "--owner") || remote?.owner || "";
  const repo = optionalStringArg(args, "--repo") || remote?.repo || "";
  if (!owner || !repo) {
    throw new Error("Unable to infer owner/repo. Pass --owner and --repo or configure origin.");
  }

  const instanceName = sanitizeInstanceName(
    optionalStringArg(args, "--instance-name") || `${owner}-${repo}`
  );
  const statusPort = optionalNumberArg(args, "--status-port") ?? (await findAvailablePort(8790));
  const statusToken =
    optionalStringArg(args, "--status-token") || randomBytes(24).toString("hex");
  const configHome = path.join(process.env.HOME ?? "", ".config", "openreactor");
  const baseEnvFile = path.join(configHome, "reactor.env");
  const instancesDir = path.join(configHome, "instances");
  const envFile = path.join(instancesDir, `${instanceName}.env`);
  const reactorServiceName = `openreactor-${instanceName}-reactor.service`;
  const watchdogServiceName = `openreactor-${instanceName}-watchdog.service`;
  const statusServiceName = `openreactor-${instanceName}-status.service`;
  const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  await fs.mkdir(instancesDir, { recursive: true });
  await fs.writeFile(
    envFile,
    [
      fsSync.existsSync(baseEnvFile) ? `source ${baseEnvFile}` : "",
      `OPENREACTOR_ENGINE_ROOT=${shellSafeValue(engineRoot)}`,
      `OPENREACTOR_MANAGED_REPO_ROOT=${shellSafeValue(cwd)}`,
      `GITHUB_OWNER=${shellSafeValue(owner)}`,
      `GITHUB_REPO=${shellSafeValue(repo)}`,
      `OPENREACTOR_STATUS_BIND_HOST=127.0.0.1`,
      `OPENREACTOR_STATUS_PORT=${statusPort}`,
      `OPENREACTOR_STATUS_TOKEN=${shellSafeValue(statusToken)}`,
      `OPENREACTOR_REACTOR_SERVICE_NAME=${shellSafeValue(reactorServiceName)}`,
      `OPENREACTOR_WATCHDOG_SERVICE_NAME=${shellSafeValue(watchdogServiceName)}`
    ]
      .filter(Boolean)
      .join("\n") + "\n",
    "utf8"
  );

  await restartTransientService({
    unitName: reactorServiceName,
    description: `OpenReactor reactor for ${owner}/${repo}`,
    envFile,
    execPath: path.join(engineRoot, "scripts", "reactor-service.sh")
  });
  await restartTransientService({
    unitName: watchdogServiceName,
    description: `OpenReactor watchdog for ${owner}/${repo}`,
    envFile,
    execPath: path.join(engineRoot, "scripts", "watchdog-service.sh")
  });
  await restartTransientService({
    unitName: statusServiceName,
    description: `OpenReactor status for ${owner}/${repo}`,
    envFile,
    execPath: path.join(engineRoot, "scripts", "openreactor-status-service.sh")
  });

  console.log(
    JSON.stringify(
      {
        owner,
        repo,
        repoRoot: cwd,
        envFile,
        instanceName,
        reactorServiceName,
        watchdogServiceName,
        statusServiceName,
        status: {
          bindHost: "127.0.0.1",
          port: statusPort,
          token: statusToken,
          url: `http://127.0.0.1:${statusPort}/status`
        }
      },
      null,
      2
    )
  );
}

async function resolvePullRequestNumber(
  owner: string,
  repo: string,
  branchName: string
): Promise<number> {
  const { stdout } = await execFileAsync(
    "gh",
    [
      "pr",
      "list",
      "--repo",
      `${owner}/${repo}`,
      "--head",
      branchName,
      "--state",
      "open",
      "--json",
      "number"
    ],
    {
      env: process.env
    }
  );

  const pullRequests = JSON.parse(stdout) as Array<{ number: number }>;
  if (!pullRequests[0]?.number) {
    throw new Error(`Unable to resolve PR number for branch ${branchName}.`);
  }

  return pullRequests[0].number;
}

async function enableAutoMerge(input: {
  owner: string;
  repo: string;
  prNumber: number;
  mergeMethod: string;
}): Promise<void> {
  const mergeMethodFlag = toMergeMethodFlag(input.mergeMethod);
  await execFileAsync(
    "gh",
    [
      "pr",
      "merge",
      "--repo",
      `${input.owner}/${input.repo}`,
      "--auto",
      mergeMethodFlag,
      String(input.prNumber)
    ],
    {
      env: process.env
    }
  );
}

function toMergeMethodFlag(mergeMethod: string): "--merge" | "--rebase" | "--squash" {
  switch (mergeMethod.trim().toLowerCase()) {
    case "merge":
      return "--merge";
    case "rebase":
      return "--rebase";
    case "squash":
    case "":
      return "--squash";
    default:
      throw new Error(`Unsupported merge method: ${mergeMethod}`);
  }
}

async function pushBranchWithToken(input: {
  cwd: string;
  owner: string;
  repo: string;
  branchName: string;
  token: string;
}): Promise<void> {
  const remoteUrl = `https://github.com/${input.owner}/${input.repo}.git`;
  const basicAuth = Buffer.from(`x-access-token:${input.token}`, "utf8").toString("base64");

  await execFileAsync(
    "git",
    [
      "-C",
      input.cwd,
      "-c",
      `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basicAuth}`,
      "push",
      remoteUrl,
      `HEAD:refs/heads/${input.branchName}`
    ],
    {
      env: process.env
    }
  );
}

function resolveGitHubToken(): string {
  const token = optionalGitHubToken();
  if (!token) {
    throw new Error("Missing GitHub token in GITHUB_TOKEN or GH_TOKEN for authenticated push.");
  }
  return token;
}

function optionalGitHubToken(): string {
  return (process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "").trim();
}

function resolveRunDir(args: string[]): string {
  const explicit = optionalStringArg(args, "--run-dir");
  if (explicit) {
    return explicit;
  }

  const fromEnv = process.env.OPENREACTOR_RUN_DIR?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  throw new Error("Missing run directory. Pass --run-dir or set OPENREACTOR_RUN_DIR.");
}

function optionalRunDir(args: string[]): string {
  const explicit = optionalStringArg(args, "--run-dir");
  if (explicit) {
    return explicit;
  }

  return process.env.OPENREACTOR_RUN_DIR?.trim() ?? "";
}

function requireNumberArg(args: string[], name: string): number {
  const value = requireStringArg(args, name);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric argument for ${name}: ${value}`);
  }
  return parsed;
}

function requireStringArg(args: string[], name: string): string {
  const value = optionalStringArg(args, name);
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

function optionalStringArg(args: string[], name: string): string {
  const index = args.indexOf(name);
  if (index < 0) {
    return "";
  }
  return args[index + 1] ?? "";
}

function optionalNumberArg(args: string[], name: string): number | null {
  const value = optionalStringArg(args, name);
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric argument for ${name}: ${value}`);
  }

  return parsed;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function inferRepoDisplayName(repoRoot: string): string {
  const remote = inferGitHubRemote(repoRoot);
  if (remote?.repo) {
    return remote.repo;
  }

  return path.basename(repoRoot);
}

function inferGitHubRemote(repoRoot: string): { owner: string; repo: string } | null {
  try {
    const raw = execFileSync("git", ["-C", repoRoot, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const match = raw.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/);
    if (match?.[1] && match?.[2]) {
      return {
        owner: match[1],
        repo: match[2]
      };
    }
  } catch {
    // Fall through to basename.
  }
  return null;
}

async function fetchGitHubUser(
  username: string,
  token: string
): Promise<{ id: number; login: string; name?: string | null }> {
  const headers = new Headers();
  headers.set("Accept", "application/vnd.github+json");
  headers.set("User-Agent", "OpenReactor-Reactor/0.1");
  headers.set("X-GitHub-Api-Version", "2022-11-28");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
    headers
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Unable to resolve GitHub user ${username}: ${response.status} ${response.statusText}${
        message ? `: ${message.trim()}` : ""
      }`
    );
  }

  return (await response.json()) as { id: number; login: string; name?: string | null };
}

function normalizeGitHubUsername(value: string): string {
  return value.trim().replace(/^@+/, "");
}

function isValidGitHubUsername(value: string): boolean {
  return /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(value);
}

function printHelp(): void {
  console.log(
    [
      "OpenReactor reactor tool",
      "",
      "Commands:",
      "  ensure-plan --issue <number> --title <title> --branch <branch> [--run-dir <dir>]",
      "  ensure-pr --issue <number> --branch <branch> --title <title> --body-file <file> [--base main] [--cwd <dir>] [--merge-method squash] [--no-auto-merge]",
      "  coauthor-trailer --username <github-login>",
      "  init-repo-state [--cwd <dir>] [--repo-name <name>]",
      "  start-instance [--cwd <dir>] [--owner <owner>] [--repo <repo>] [--instance-name <name>] [--status-port <port>] [--status-token <token>]",
      "",
      "Notes:",
      "  ensure-pr pushes over HTTPS using GITHUB_TOKEN/GH_TOKEN, so reactor runs publish branches as the GitHub App rather than the machine's SSH identity.",
      "  Auto-merge is enabled by default. Pass --no-auto-merge when the PR should wait for human or manual review.",
      "  coauthor-trailer resolves a GitHub login to a GitHub-recognized Co-authored-by trailer using the account's user id.",
      "  init-repo-state creates the committed repo-local product steering files under .openreactor/repo/.",
      "  start-instance writes a repo-specific env file and starts transient reactor, watchdog, and local status services for that repo."
    ].join("\n")
  );
}

async function preparePullRequestBody(bodyPath: string, runDir: string): Promise<string> {
  const originalBody = await fs.readFile(bodyPath, "utf8");
  const footer = runDir ? await buildExecutionFooter(runDir) : "";
  const nextBody = renderBodyWithExecutionFooter(originalBody, footer);

  if (nextBody === originalBody) {
    return bodyPath;
  }

  const outputPath = path.join(path.dirname(bodyPath), `${path.basename(bodyPath, path.extname(bodyPath))}.openreactor${path.extname(bodyPath) || ".md"}`);
  await fs.writeFile(outputPath, nextBody, "utf8");
  return outputPath;
}

async function restartTransientService(input: {
  unitName: string;
  description: string;
  envFile: string;
  execPath: string;
}): Promise<void> {
  try {
    await execFileAsync("systemctl", ["--user", "stop", input.unitName], {
      env: process.env
    });
  } catch {
    // Ignore if not running.
  }

  try {
    await execFileAsync("systemctl", ["--user", "reset-failed", input.unitName], {
      env: process.env
    });
  } catch {
    // Ignore if unit does not exist yet.
  }

  await execFileAsync(
    "systemd-run",
    [
      "--user",
      "--unit",
      input.unitName,
      "--property",
      `Description=${input.description}`,
      "--property",
      "Restart=always",
      "--property",
      "RestartSec=5",
      "--property",
      "TimeoutStopSec=20",
      "--setenv",
      `OPENREACTOR_ENV_FILE=${input.envFile}`,
      "/usr/bin/bash",
      input.execPath
    ],
    {
      env: process.env
    }
  );
}

async function findAvailablePort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 100; port += 1) {
    if (await canBindPort(port)) {
      return port;
    }
  }

  throw new Error(`Unable to find an available local port starting at ${startPort}.`);
}

async function canBindPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

function sanitizeInstanceName(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!cleaned) {
    throw new Error("Instance name cannot be empty.");
  }

  return cleaned;
}

function shellSafeValue(value: string): string {
  return JSON.stringify(value);
}

void main();
