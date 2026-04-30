import type { WorkItem } from "../types";

export type TokenVisualKind = "issue" | "pull-request";

export function resolveItemVisualKind(item: WorkItem): TokenVisualKind {
  const normalizedKind = item.kind.trim().toLowerCase();
  if (
    normalizedKind === "pull-request" ||
    normalizedKind === "pull_request" ||
    normalizedKind === "pullrequest" ||
    normalizedKind === "pr"
  ) {
    return "pull-request";
  }

  const ext = item.extensions?.openreactor as Record<string, unknown> | undefined;
  const artifactKind = String(ext?.artifactKind ?? "").trim().toLowerCase();
  if (
    artifactKind === "pull-request" ||
    artifactKind === "pull_request" ||
    artifactKind === "pullrequest" ||
    artifactKind === "pr"
  ) {
    return "pull-request";
  }

  if (ext?.ciPending || ext?.pullRequestUrl || ext?.prUrl) {
    return "pull-request";
  }

  return "issue";
}
