import fs from "node:fs/promises";
import path from "node:path";
import type {
  RunActivityEvent,
  RunActivityKind,
  RunActivityLevel,
  RunTranscriptEntry,
  TranscriptStream
} from "../packages/contracts/src/runtime";

const DEFAULT_MAX_ACTIVITY_ITEMS = 20;
const DEFAULT_MAX_TRANSCRIPT_ITEMS = 8;

export function getRunArtifactPaths(runDir: string): {
  eventsPath: string;
  transcriptPath: string;
} {
  return {
    eventsPath: path.join(runDir, "events.jsonl"),
    transcriptPath: path.join(runDir, "transcript.jsonl")
  };
}

export async function appendRunActivity(
  runDir: string,
  input: {
    issueNumber: number;
    iteration?: number;
    kind: RunActivityKind;
    level?: RunActivityLevel;
    title: string;
    message: string;
    data?: Record<string, unknown>;
  }
): Promise<RunActivityEvent> {
  const event: RunActivityEvent = {
    id: buildArtifactId("evt"),
    at: new Date().toISOString(),
    issueNumber: input.issueNumber,
    iteration: input.iteration,
    kind: input.kind,
    level: input.level ?? "info",
    title: input.title,
    message: input.message,
    ...(input.data ? { data: input.data } : {})
  };

  await appendJsonLine(getRunArtifactPaths(runDir).eventsPath, event);
  return event;
}

export async function appendTranscriptEntry(
  runDir: string,
  input: {
    issueNumber: number;
    iteration?: number;
    stream: TranscriptStream;
    provider?: string | null;
    toolName?: string | null;
    text: string;
  }
): Promise<RunTranscriptEntry | null> {
  const normalizedText = input.text.replace(/\u0000/g, "");
  if (!normalizedText.trim()) {
    return null;
  }

  const entry: RunTranscriptEntry = {
    id: buildArtifactId("trn"),
    at: new Date().toISOString(),
    issueNumber: input.issueNumber,
    iteration: input.iteration,
    stream: input.stream,
    provider: input.provider ?? null,
    toolName: input.toolName ?? null,
    text: normalizedText
  };

  await appendJsonLine(getRunArtifactPaths(runDir).transcriptPath, entry);
  return entry;
}

export async function readRecentRunActivity(
  runDir: string,
  maxItems = DEFAULT_MAX_ACTIVITY_ITEMS
): Promise<RunActivityEvent[]> {
  return readRecentJsonLines<RunActivityEvent>(getRunArtifactPaths(runDir).eventsPath, maxItems);
}

export async function readRecentTranscriptEntries(
  runDir: string,
  maxItems = DEFAULT_MAX_TRANSCRIPT_ITEMS
): Promise<RunTranscriptEntry[]> {
  return readRecentJsonLines<RunTranscriptEntry>(getRunArtifactPaths(runDir).transcriptPath, maxItems);
}

export async function readRecentActivityAcrossRuns(
  runsDir: string,
  maxItems = DEFAULT_MAX_ACTIVITY_ITEMS
): Promise<RunActivityEvent[]> {
  const entries = await fs.readdir(runsDir, { withFileTypes: true }).catch(() => []);
  const events = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("issue-"))
      .map((entry) =>
        readRecentRunActivity(path.join(runsDir, entry.name), maxItems).catch(() => [])
      )
  );

  return events
    .flat()
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
    .slice(0, maxItems);
}

async function appendJsonLine(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

async function readRecentJsonLines<T>(filePath: string, maxItems: number): Promise<T[]> {
  const raw = await fs.readFile(filePath, "utf8").catch(() => "");
  if (!raw.trim()) {
    return [];
  }

  return raw
    .trim()
    .split(/\r?\n/)
    .slice(-maxItems)
    .map((line) => JSON.parse(line) as T);
}

function buildArtifactId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
