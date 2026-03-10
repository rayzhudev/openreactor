export type AgentToolName = "spawn_codex_issue_agent" | "spawn_claude_ui_agent";

export interface AgentToolDefinition {
  name: AgentToolName;
  label: string;
  description: string;
  provider: "codex" | "claude";
  primaryUse: "general" | "ui";
}

export const DEFAULT_AGENT_TOOL: AgentToolName = "spawn_codex_issue_agent";

export const AGENT_TOOLS: Record<AgentToolName, AgentToolDefinition> = {
  spawn_codex_issue_agent: {
    name: "spawn_codex_issue_agent",
    label: "Codex Issue Agent",
    description:
      "General-purpose implementation agent for product, backend, orchestration, API, and non-UI tasks.",
    provider: "codex",
    primaryUse: "general"
  },
  spawn_claude_ui_agent: {
    name: "spawn_claude_ui_agent",
    label: "Claude UI Agent",
    description:
      "Frontend-focused implementation agent for visual design, layout, styling, interaction polish, and other UI-heavy work.",
    provider: "claude",
    primaryUse: "ui"
  }
};

export function isAgentToolName(value: string | null | undefined): value is AgentToolName {
  return value === "spawn_codex_issue_agent" || value === "spawn_claude_ui_agent";
}

export function getAgentTool(value: string | null | undefined): AgentToolDefinition {
  if (isAgentToolName(value)) {
    return AGENT_TOOLS[value];
  }

  return AGENT_TOOLS[DEFAULT_AGENT_TOOL];
}

export function describeAgentToolsForPrompt(): string {
  return Object.values(AGENT_TOOLS)
    .map((tool) => `- \`${tool.name}\`: ${tool.description}`)
    .join("\n");
}
