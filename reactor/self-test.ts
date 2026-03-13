import { loadConfig } from "./config";
import { GitHubClient } from "./github";

const SELF_TEST_TITLE = "[Self-Test] OpenReactor Factory Pass";
const OPENREACTOR_CORE_LABEL = "openreactor-core";

async function main(): Promise<void> {
  const config = loadConfig();
  const github = new GitHubClient(config);

  const existing = await findExistingSelfTestIssue(github);
  if (existing) {
    console.log(existing.html_url);
    return;
  }

  const issue = await github.createIssue({
    title: SELF_TEST_TITLE,
    body: buildSelfTestBody(config.owner, config.featureRequestMarker),
    labels: [
      OPENREACTOR_CORE_LABEL,
      config.maintainerSteeredLabel,
      config.authenticatedSubmitterLabel
    ]
  });

  console.log(issue.html_url);
}

async function findExistingSelfTestIssue(github: GitHubClient) {
  const issues = await github.listRecentlyUpdatedIssues("all");
  return issues.find(
    (issue) =>
      !issue.pull_request &&
      issue.state === "open" &&
      issue.title.trim() === SELF_TEST_TITLE
  ) ?? null;
}

function buildSelfTestBody(owner: string, marker: string): string {
  const submittedAt = new Date().toISOString();

  return [
    marker,
    "",
    "## Summary",
    "Run an OpenReactor Factory Pass to verify the issue-to-PR loop end to end.",
    "",
    "## Problem",
    "OpenReactor needs a repeatable canary run that exercises the real autonomous flow. This should reveal regressions in issue claiming, triage, implementation, PR creation, merge readiness, and documentation propagation before they become invisible workflow breakages.",
    "",
    "## Desired Outcome",
    "Carry out one minimal, low-risk OpenReactor Factory Pass. The accepted implementation should make the smallest safe tracked-repo change needed to prove the end-to-end loop is functioning, and it should record the pass in OPENREACTOR_FACTORY_PASS.md.",
    "",
    "## Desired Scope",
    "25 / 100 — Minimal change",
    "",
    "## Constraints",
    "- Keep the change small, safe, and easy to review.\n- Prefer updating OpenReactor documentation or the dedicated factory-pass log over changing product behavior.\n- Do not introduce secrets, infrastructure churn, or broad refactors.",
    "",
    "## Success Criteria",
    "- OpenReactor claims and completes the issue through the normal PR flow.\n- The run appends or updates a new entry in OPENREACTOR_FACTORY_PASS.md.\n- The issue comment and PR explain what part of the workflow was exercised and what was learned.",
    "",
    "## Additional Notes",
    "- This is a deliberate OpenReactor canary run, not a product feature request.\n- Treat it as maintainer-steered OpenReactor-core work.",
    "",
    "## Submitted By",
    `GitHub @${owner}`,
    "",
    "## GitHub Username",
    `@${owner}`,
    "",
    "## Submission Identity",
    `Authenticated GitHub session (@${owner})`,
    "",
    "## Contact",
    "_Not provided_",
    "",
    "## Intake Metadata",
    `- Submitted at: ${submittedAt}`,
    "- Origin: local OpenReactor Factory Pass"
  ].join("\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
