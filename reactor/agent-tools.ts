export type AgentToolName =
  | "spawn_codex_issue_agent"
  | "spawn_codex_ui_agent"
  | "spawn_codex_planner_agent"
  | "spawn_claude_issue_agent"
  | "spawn_claude_planner_agent";

export interface AgentToolDefinition {
  name: AgentToolName;
  label: string;
  description: string;
  provider: "codex" | "claude";
  primaryUse: "general" | "planning" | "ui";
  triageSelectable: boolean;
}

export const DEFAULT_AGENT_TOOL: AgentToolName = "spawn_codex_issue_agent";

export const AGENT_TOOLS: Record<AgentToolName, AgentToolDefinition> = {
  spawn_codex_issue_agent: {
    name: "spawn_codex_issue_agent",
    label: "Codex Issue Agent",
    description:
      "General-purpose implementation agent for product, backend, orchestration, API, and non-UI tasks.",
    provider: "codex",
    primaryUse: "general",
    triageSelectable: true
  },
  spawn_codex_planner_agent: {
    name: "spawn_codex_planner_agent",
    label: "Codex Planner Agent",
    description:
      "Planning-focused Codex agent for oversized but worthwhile requests that should be decomposed into smaller executable issues.",
    provider: "codex",
    primaryUse: "planning",
    triageSelectable: true
  },
  spawn_codex_ui_agent: {
    name: "spawn_codex_ui_agent",
    label: "Codex UI Agent",
    description:
      "Frontend-focused Codex agent for visual design, layout, styling, interaction polish, and UI-heavy product work. Runs a high-reasoning design-image prepass before implementation.",
    provider: "codex",
    primaryUse: "ui",
    triageSelectable: true
  },
  spawn_claude_issue_agent: {
    name: "spawn_claude_issue_agent",
    label: "Claude Issue Agent",
    description:
      "General-purpose Claude fallback agent for product, backend, orchestration, API, and non-UI tasks when the preferred provider is unavailable.",
    provider: "claude",
    primaryUse: "general",
    triageSelectable: false
  },
  spawn_claude_planner_agent: {
    name: "spawn_claude_planner_agent",
    label: "Claude Planner Agent",
    description:
      "Planning-focused Claude fallback agent for oversized requests when the preferred provider is unavailable.",
    provider: "claude",
    primaryUse: "planning",
    triageSelectable: false
  }
};

export function isAgentToolName(value: string | null | undefined): value is AgentToolName {
  return (
    value === "spawn_codex_issue_agent" ||
    value === "spawn_codex_ui_agent" ||
    value === "spawn_codex_planner_agent" ||
    value === "spawn_claude_issue_agent" ||
    value === "spawn_claude_planner_agent"
  );
}

export function getAgentTool(value: string | null | undefined): AgentToolDefinition {
  if (isAgentToolName(value)) {
    return AGENT_TOOLS[value];
  }

  return AGENT_TOOLS[DEFAULT_AGENT_TOOL];
}

export function describeAgentToolsForPrompt(): string {
  return Object.values(AGENT_TOOLS)
    .filter((tool) => tool.triageSelectable)
    .map((tool) => `- \`${tool.name}\`: ${tool.description}`)
    .join("\n");
}

export function getFallbackToolForProviderOutage(
  value: AgentToolName | null | undefined
): AgentToolName | null {
  switch (value) {
    case "spawn_codex_issue_agent":
      return "spawn_claude_issue_agent";
    case "spawn_codex_planner_agent":
      return "spawn_claude_planner_agent";
    case "spawn_codex_ui_agent":
      return null;
    case "spawn_claude_issue_agent":
      return "spawn_codex_issue_agent";
    case "spawn_claude_planner_agent":
      return "spawn_codex_planner_agent";
    default:
      return null;
  }
}
