import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadConfig } from "./config";

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
  const token = resolveGitHubToken();

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
    console.log(
      JSON.stringify(
        {
          issueNumber,
          branchName,
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
      bodyFile
    ],
    {
      env: process.env
    }
  );

  console.log(
    JSON.stringify(
      {
        issueNumber,
        branchName,
        prUrl: createdStdout.trim()
      },
      null,
      2
    )
  );
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
  const token = (process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "").trim();
  if (!token) {
    throw new Error("Missing GitHub token in GITHUB_TOKEN or GH_TOKEN for authenticated push.");
  }
  return token;
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

function printHelp(): void {
  console.log(
    [
      "OpenReactor reactor tool",
      "",
      "Commands:",
      "  ensure-plan --issue <number> --title <title> --branch <branch> [--run-dir <dir>]",
      "  ensure-pr --issue <number> --branch <branch> --title <title> --body-file <file> [--base main] [--cwd <dir>]",
      "",
      "Notes:",
      "  ensure-pr pushes over HTTPS using GITHUB_TOKEN/GH_TOKEN, so reactor runs publish branches as the GitHub App rather than the machine's SSH identity."
    ].join("\n")
  );
}

void main();
