import process from "node:process";
import { loadConfig } from "./config";
import { GitHubClient, type GitHubIssue } from "./github";

const TITLE = "[Self-Test] OpenReactor Autonomous Test Run";
const LEGACY_TITLE = "[Self-Test] OpenReactor Factory Pass";
const MARKER = "<!-- openreactor:autonomous-test-run -->";
const TRACKED_FILE = "OPENREACTOR_AUTONOMOUS_TEST_RUN.md";

async function main(): Promise<void> {
  const config = loadConfig(process.cwd());
  const github = new GitHubClient(config);
  const existingOpenIssue = await findOpenAutonomousTestRun(github);

  const body = [
    config.featureRequestMarker,
    MARKER,
    "",
    "## Summary",
    "Run an OpenReactor Autonomous Test Run to verify the issue-to-PR loop end to end.",
    "",
    "## Problem",
    "OpenReactor needs a repeatable automated canary run that exercises the real autonomous flow. This should reveal regressions in issue claiming, triage, implementation, PR creation, merge readiness, trust propagation, and documentation updates before they become invisible workflow breakages.",
    "",
    "## Desired Outcome",
    "Carry out one minimal, low-risk OpenReactor Autonomous Test Run. The accepted implementation should make the smallest safe tracked-repo change needed to prove the end-to-end loop is functioning, and it should record the pass in `OPENREACTOR_AUTONOMOUS_TEST_RUN.md`.",
    "",
    "## Desired Scope",
    "25 / 100 — Minimal change",
    "",
    "## Constraints",
    "- Keep the change small, safe, and easy to review.",
    `- Prefer updating OpenReactor documentation or \`${TRACKED_FILE}\` over changing product behavior.`,
    "- Do not introduce secrets, infrastructure churn, or broad refactors.",
    "",
    "## Success Criteria",
    "- OpenReactor claims and completes the issue through the normal PR flow.",
    `- The run appends or updates a new entry in \`${TRACKED_FILE}\`.`,
    "- The issue comment and PR explain what part of the workflow was exercised and what was learned.",
    "",
    "## Additional Notes",
    "- This is a deliberate OpenReactor canary run, not a product feature request.",
    "- Treat it as maintainer-steered OpenReactor-core work.",
    "",
    "## Submitted By",
    `GitHub @${config.owner}`,
    "",
    "## GitHub Username",
    `@${config.owner}`,
    "",
    "## Submission Identity",
    `Authenticated GitHub session (@${config.owner})`,
    "",
    "## Contact",
    "_Not provided_",
    "",
    "## Intake Metadata",
    `- Submitted at: ${new Date().toISOString()}`,
    "- Origin: local OpenReactor Autonomous Test Run"
  ].join("\n");

  if (existingOpenIssue) {
    await github.updateIssue(existingOpenIssue.number, {
      title: TITLE,
      body
    });
    await github.addLabels(existingOpenIssue.number, [
      "openreactor-core",
      config.maintainerSteeredLabel,
      config.authenticatedSubmitterLabel
    ]);
    console.log(
      JSON.stringify(
        {
          action: "reused",
          number: existingOpenIssue.number,
          title: TITLE,
          url: existingOpenIssue.html_url
        },
        null,
        2
      )
    );
    return;
  }

  const createdIssue = await github.createIssue({
    title: TITLE,
    body,
    labels: [
      "openreactor-core",
      config.maintainerSteeredLabel,
      config.authenticatedSubmitterLabel
    ]
  });

  console.log(
    JSON.stringify(
      {
        action: "created",
        number: createdIssue.number,
        title: createdIssue.title,
        url: createdIssue.html_url
      },
      null,
      2
    )
  );
}

async function findOpenAutonomousTestRun(github: GitHubClient): Promise<GitHubIssue | null> {
  const issues = await github.listRecentlyUpdatedIssues("open");
  return (
    issues.find((issue) => {
      if (issue.pull_request) {
        return false;
      }

      return (
        issue.title.trim() === TITLE ||
        issue.title.trim() === LEGACY_TITLE ||
        (issue.body ?? "").includes(MARKER)
      );
    }) ?? null
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
