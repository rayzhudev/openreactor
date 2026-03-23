export interface WorkspacePolicy {
  version: 1;
  executionMode?: "isolated-worktree";
  provisionCommand?: string;
  teardownCommand?: string;
  env?: Record<string, string>;
}

export type RunActivityLevel = "info" | "warn" | "error";
export type RunActivityKind = "workspace" | "process" | "status" | "github" | "system";
export type TranscriptStream = "stdout" | "stderr" | "system";

export interface RunActivityEvent {
  id: string;
  at: string;
  issueNumber: number;
  iteration?: number;
  kind: RunActivityKind;
  level: RunActivityLevel;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface RunTranscriptEntry {
  id: string;
  at: string;
  issueNumber: number;
  iteration?: number;
  stream: TranscriptStream;
  provider?: string | null;
  toolName?: string | null;
  text: string;
}
