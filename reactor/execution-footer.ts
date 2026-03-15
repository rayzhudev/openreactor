import fs from "node:fs/promises";
import path from "node:path";

export const EXECUTION_FOOTER_MARKER = "<!-- openreactor:execution-footer -->";

interface ExecutionSummary {
  providerLabel?: string | null;
  model?: string | null;
  reasoningEffort?: string | null;
  serviceTier?: string | null;
  toolLabel?: string | null;
  durationMs?: number | null;
}

interface RunRecordSummary {
  triageExecution?: ExecutionSummary | null;
  lastAgentExecution?: ExecutionSummary | null;
  lastResult?: {
    considerations?: string[] | null;
  } | null;
}

export async function buildExecutionFooter(runDir: string): Promise<string> {
  const runPath = path.join(runDir, "run.json");
  let runRecord: RunRecordSummary | null = null;

  try {
    runRecord = JSON.parse(await fs.readFile(runPath, "utf8")) as RunRecordSummary;
  } catch {
    return "";
  }

  const lines = [EXECUTION_FOOTER_MARKER, "## OpenReactor Execution"];

  if (runRecord?.triageExecution) {
    lines.push(`- Triage: ${formatExecutionSummary(runRecord.triageExecution)}`);
  }

  if (runRecord?.lastAgentExecution) {
    lines.push(`- Implementation: ${formatExecutionSummary(runRecord.lastAgentExecution)}`);
  }

  const considerations = (runRecord?.lastResult?.considerations ?? [])
    .map((item: string) => item.trim())
    .filter(Boolean)
    .slice(0, 6);

  if (considerations.length) {
    lines.push("- Considered:");
    lines.push(...considerations.map((item: string) => `  - ${item}`));
  }

  return lines.length > 2 ? lines.join("\n") : "";
}

export function renderBodyWithExecutionFooter(body: string, footer: string): string {
  const normalizedBody = stripExecutionFooter(body).trimEnd();
  if (!footer) {
    return normalizedBody ? `${normalizedBody}\n` : "";
  }

  if (!normalizedBody) {
    return `${footer}\n`;
  }

  return `${normalizedBody}\n\n${footer}\n`;
}

export function stripExecutionFooter(body: string): string {
  const footerPattern = new RegExp(`\\n*${escapeRegExp(EXECUTION_FOOTER_MARKER)}[\\s\\S]*$`);
  return body.replace(footerPattern, "");
}

function formatExecutionSummary(execution: ExecutionSummary): string {
  const parts = [
    [execution.providerLabel, execution.model].filter(Boolean).join(" ").trim(),
    execution.reasoningEffort ? `reasoning ${execution.reasoningEffort}` : "",
    execution.serviceTier ? `service tier ${execution.serviceTier}` : "",
    execution.toolLabel ? `tool ${execution.toolLabel}` : "",
    typeof execution.durationMs === "number" ? `duration ${formatDurationMs(execution.durationMs)}` : ""
  ].filter(Boolean);

  return parts.join(" • ");
}

function formatDurationMs(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${totalSeconds}s`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
