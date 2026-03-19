import type { GitHubPullRequest } from "./github";

export function hasConflictingMergeState(value?: string | null): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "dirty" || normalized === "conflicting";
}

export function hasKnownCleanMergeState(value?: string | null): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return ["clean", "behind", "blocked", "unstable", "has_hooks", "draft", "unknown"].includes(
    normalized
  );
}

export function hasMergeConflict(pullRequest: GitHubPullRequest): boolean {
  if (pullRequest.mergeable === false) {
    return true;
  }

  if (hasConflictingMergeState(pullRequest.mergeable_state)) {
    return true;
  }

  if (pullRequest.mergeable === true || hasKnownCleanMergeState(pullRequest.mergeable_state)) {
    return false;
  }

  return false;
}

export function canDirectlyMergeAcceptedPullRequest(pullRequest: GitHubPullRequest): boolean {
  if (pullRequest.state !== "open" || pullRequest.draft) {
    return false;
  }

  if (pullRequest.mergeable === true) {
    return true;
  }

  const normalized = (pullRequest.mergeable_state ?? "").trim().toLowerCase();
  return normalized === "clean";
}

export function isExpectedDirectMergeWaitError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message =
    `${typeof (error as { message?: unknown }).message === "string" ? (error as { message: string }).message : ""}\n` +
    `${typeof (error as { stderr?: unknown }).stderr === "string" ? (error as { stderr: string }).stderr : ""}`.toLowerCase();

  return (
    message.includes("base branch was modified") ||
    message.includes("pull request is not mergeable") ||
    message.includes("head branch was modified") ||
    message.includes("required status check") ||
    message.includes("review required") ||
    message.includes("is in clean status") ||
    message.includes("must be enabled for this repository")
  );
}
