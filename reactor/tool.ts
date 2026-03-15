import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadConfig } from "./config";
import { buildExecutionFooter, renderBodyWithExecutionFooter } from "./execution-footer";

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

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
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
      "",
      "Notes:",
      "  ensure-pr pushes over HTTPS using GITHUB_TOKEN/GH_TOKEN, so reactor runs publish branches as the GitHub App rather than the machine's SSH identity.",
      "  Auto-merge is enabled by default. Pass --no-auto-merge when the PR should wait for human or manual review.",
      "  coauthor-trailer resolves a GitHub login to a GitHub-recognized Co-authored-by trailer using the account's user id."
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

void main();
