import type { AutomationStatusPayload, WorkItem, ActorSnapshot, ExecutionSnapshot, IncidentSnapshot, ServiceSnapshot } from "../src/types";

const TOPOLOGY_NODES = [
  { id: "intake", kind: "source" as const, label: "Intake" },
  { id: "triage-planning", kind: "processor" as const, label: "Triage & Planning", capacity: { maxConcurrency: 2 } },
  { id: "execution", kind: "processor" as const, label: "Execution", capacity: { maxConcurrency: 3 } },
  { id: "waiting", kind: "human-gate" as const, label: "Waiting" },
  { id: "completed", kind: "sink" as const, label: "Merged" },
  { id: "rejected", kind: "sink" as const, label: "Rejected" },
  { id: "watchdog", kind: "supervisor" as const, label: "Watchdog" },
];

const TOPOLOGY_EDGES = [
  { id: "intake-to-triage", fromNodeId: "intake", toNodeId: "triage-planning", kind: "flow" as const },
  { id: "triage-to-execution", fromNodeId: "triage-planning", toNodeId: "execution", kind: "flow" as const },
  { id: "execution-to-completed", fromNodeId: "execution", toNodeId: "completed", kind: "flow" as const },
  { id: "execution-retry", fromNodeId: "execution", toNodeId: "execution", kind: "retry" as const },
  { id: "execution-to-waiting", fromNodeId: "execution", toNodeId: "waiting", kind: "handoff" as const },
  { id: "triage-to-rejected", fromNodeId: "triage-planning", toNodeId: "rejected", kind: "flow" as const },
  { id: "triage-to-intake", fromNodeId: "triage-planning", toNodeId: "intake", kind: "handoff" as const },
  { id: "watchdog-to-execution", fromNodeId: "watchdog", toNodeId: "execution", kind: "control" as const },
];

const ISSUE_TITLES = [
  "Add dark mode to settings page",
  "Fix mobile layout on queue page",
  "Improve error messages in submit form",
  "Add keyboard shortcuts documentation",
  "Refactor queue pagination logic",
  "Add leaderboard filtering by time range",
  "Polish playground story navigation",
  "Implement webhook retry backoff",
  "Add CSV export to leaderboard",
  "Use live repo policy for rejection triage",
  "Add runtime hardening foundations",
  "Update contributor onboarding guide",
  "Fix race condition in status polling",
  "Add support for image attachments",
  "Improve triage classification accuracy",
  "Add rate limit dashboard widget",
  "Fix stale heartbeat false positives",
  "Add bulk issue import from CSV",
];

const AGENT_TEMPLATES = [
  { role: "general", label: "Codex Agent", provider: "codex", model: "gpt-5.5" },
  { role: "ui", label: "Claude UI Agent", provider: "claude", model: "claude-sonnet-4-6" },
  { role: "planning", label: "Codex Planner", provider: "codex", model: "gpt-5.5" },
];

type Stage = "intake" | "triage-planning" | "execution" | "waiting" | "completed" | "decomposed" | "rejected";
type TriageOutcome = "dispatch" | "reject" | "bank" | "decompose";
type BlockReason = "maintainer-handoff";
type ArtifactKind = "issue" | "pull-request";

type FailureKind = "ci-failure" | "merge-conflict" | null;

interface SimIssue {
  number: number;
  title: string;
  artifactKind: ArtifactKind;
  stage: Stage;
  state: WorkItem["state"];
  outcome?: string;
  retryCount: number;
  agentIdx: number | null;
  ticksInStage: number;
  triageOutcome: TriageOutcome;
  blockReason: BlockReason;
  failureKind: FailureKind;
  lastFailureKind: FailureKind;
  stalledHeartbeat: boolean;
  providerFallback: boolean;
  childIssues?: number[];
  plannerActive: boolean;
  ciPending: boolean;
  ciPendingTicks: number;
}

interface SimState {
  issues: SimIssue[];
  nextIssueNumber: number;
  tick: number;
  rateLimited: boolean;
  rateLimitTicks: number;
}

function createSimState(): SimState {
  return {
    issues: [],
    nextIssueNumber: 300,
    tick: 0,
    rateLimited: false,
    rateLimitTicks: 0,
  };
}

function spawnIssue(sim: SimState): SimIssue {
  const num = sim.nextIssueNumber++;
  const title = ISSUE_TITLES[num % ISSUE_TITLES.length];
  const roll = Math.random();

  let triageOutcome: TriageOutcome = "dispatch";
  if (roll < 0.1) triageOutcome = "reject";
  else if (roll < 0.18) triageOutcome = "bank";
  else if (roll < 0.25) triageOutcome = "decompose";

  return {
    number: num,
    title,
    artifactKind: "issue",
    stage: "intake",
    state: "queued",
    retryCount: 0,
    agentIdx: null,
    ticksInStage: 0,
    triageOutcome,
    blockReason: "maintainer-handoff",
    failureKind: Math.random() < 0.15 ? "ci-failure" : Math.random() < 0.15 ? "merge-conflict" : null,
    lastFailureKind: null,
    stalledHeartbeat: false,
    providerFallback: false,
    plannerActive: false,
    ciPending: false,
    ciPendingTicks: 0,
  };
}

function advanceSim(sim: SimState): void {
  sim.tick++;

  // Rate limit event: triggers every ~30 ticks, lasts 4 ticks
  if (!sim.rateLimited && sim.tick > 10 && sim.tick % 30 === 0 && Math.random() < 0.4) {
    sim.rateLimited = true;
    sim.rateLimitTicks = 4;
  }
  if (sim.rateLimited) {
    sim.rateLimitTicks--;
    if (sim.rateLimitTicks <= 0) {
      sim.rateLimited = false;
    }
  }

  // Spawn new issues (spawn faster to build up queues)
  // GitHub rate limit blocks intake — no new issues can be fetched
  if (!sim.rateLimited && sim.tick % 2 === 0 && sim.issues.filter((i) => i.stage === "intake").length < 12) {
    sim.issues.push(spawnIssue(sim));
    if (Math.random() < 0.3) sim.issues.push(spawnIssue(sim));
  }

  for (const issue of sim.issues) {
    issue.ticksInStage++;

    switch (issue.stage) {
      case "intake":
        // Moving issues from intake requires GitHub API access
        if (sim.rateLimited) break;
        if (issue.ticksInStage >= 2) {
          const triaging = sim.issues.filter((i) => i.stage === "triage-planning");
          if (triaging.length < 1) {
            issue.stage = "triage-planning";
            issue.state = "running";
            issue.ticksInStage = 0;
          }
        }
        break;

      case "triage-planning":
        // Phase 1: Triage agent evaluates the issue (ticks 0–2)
        // Phase 2: If decompose, triage calls over planner (tick 3), hands off, goes idle
        // Phase 3: Planner works on decomposition (ticks 3–6), then creates children
        if (issue.plannerActive) {
          // Planner is working on decomposition
          if (issue.ticksInStage >= 6) {
            issue.stage = "decomposed";
            issue.state = "succeeded";
            issue.outcome = "decomposed";
            issue.plannerActive = false;
            issue.ticksInStage = 0;
            const children: number[] = [];
            for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
              const child = spawnIssue(sim);
              child.triageOutcome = "dispatch";
              children.push(child.number);
              sim.issues.push(child);
            }
            issue.childIssues = children;
          }
        } else if (issue.ticksInStage >= 3) {
          switch (issue.triageOutcome) {
            case "reject":
              issue.stage = "rejected";
              issue.state = "succeeded";
              issue.outcome = "rejected";
              issue.ticksInStage = 0;
              break;

            case "bank":
              issue.stage = "rejected";
              issue.state = "deferred";
              issue.outcome = "banked";
              issue.ticksInStage = 0;
              break;

            case "decompose":
              // Triage agent calls over planner — hands off the issue
              issue.plannerActive = true;
              // Don't reset ticksInStage — planner continues from here
              break;

            case "dispatch": {
              const executing = sim.issues.filter((i) => i.stage === "execution");
              if (executing.length < 3) {
                issue.stage = "execution";
                issue.state = "running";
                issue.agentIdx = executing.length % AGENT_TEMPLATES.length;
                issue.ticksInStage = 0;
                if (Math.random() < 0.15) {
                  issue.providerFallback = true;
                }
              }
              break;
            }
          }
        }
        break;

      case "execution":
        if (issue.state === "queued" && !issue.ciPending) {
          const activeAgents = sim.issues.filter(
            (i) => i.stage === "execution" && i.agentIdx !== null
          );
          if (activeAgents.length < 3) {
            issue.state = "running";
            issue.agentIdx = activeAgents.length % AGENT_TEMPLATES.length;
            issue.ticksInStage = 0;
          }
          break;
        }

        // CI-pending: PR is on the outgoing belt, waiting for CI result
        if (issue.ciPending) {
          issue.ciPendingTicks++;
          // CI takes 2 ticks to report back
          if (issue.ciPendingTicks >= 2 && !sim.rateLimited) {
            issue.ciPending = false;
            issue.ciPendingTicks = 0;
            if (issue.failureKind && issue.retryCount < 2) {
              // PR watcher detected failure — pull it back
              issue.lastFailureKind = issue.failureKind;
              issue.state = "retrying";
              issue.retryCount++;
              issue.ticksInStage = 0;
            } else if (issue.blockReason === "maintainer-handoff" && Math.random() < 0.15 && issue.retryCount === 0) {
              issue.stage = "waiting";
              issue.state = "waiting";
              issue.ticksInStage = 0;
            } else {
              // CI passed — merged
              issue.stage = "completed";
              issue.state = "succeeded";
              issue.outcome = "accepted";
              issue.lastFailureKind = null;
              issue.ticksInStage = 0;
            }
          }
          break;
        }

        // Retrying items wait a few ticks then get a new agent to auto-fix
        if (issue.state === "retrying") {
          if (issue.ticksInStage >= 3) {
            const activeAgents = sim.issues.filter(
              (i) => i.stage === "execution" && i.agentIdx !== null
            );
            if (activeAgents.length < 3) {
              issue.state = "running";
              issue.agentIdx = activeAgents.length % AGENT_TEMPLATES.length;
              issue.ticksInStage = 0;
              // After auto-fix, unlikely to fail the same way again
              issue.failureKind = Math.random() < 0.1 ? issue.failureKind : null;
              issue.stalledHeartbeat = false;
            }
          }
          break;
        }

        // Stale heartbeat: randomly stall an agent mid-execution
        if (issue.ticksInStage === 3 && Math.random() < 0.1) {
          issue.stalledHeartbeat = true;
        }
        // Watchdog detects stall after 2 more ticks → retry
        if (issue.stalledHeartbeat && issue.ticksInStage >= 5) {
          issue.stalledHeartbeat = false;
          issue.state = "retrying";
          issue.retryCount++;
          issue.agentIdx = null;
          issue.ticksInStage = 0;
          break;
        }

        // Agent finished coding — PR created, send to outgoing belt for CI
        if (!issue.stalledHeartbeat && issue.ticksInStage >= 5 && !sim.rateLimited) {
          issue.artifactKind = "pull-request";
          issue.ciPending = true;
          issue.ciPendingTicks = 0;
          issue.state = "queued";
          issue.agentIdx = null;
        }
        break;

      case "waiting":
        // Manual intervention clears the blocker, then the issue rejoins
        // execution so the reactor can finish the run.
        if (issue.ticksInStage >= 6 && !sim.rateLimited) {
          issue.stage = "execution";
          issue.state = "queued";
          issue.agentIdx = null;
          issue.ticksInStage = 0;
        }
        break;

      case "completed":
      case "decomposed":
        break;
    }
  }

  // Cap terminal stages
  for (const terminal of ["completed", "decomposed", "rejected"] as Stage[]) {
    const items = sim.issues.filter((i) => i.stage === terminal);
    if (items.length > 8) {
      const toRemove = items.slice(0, items.length - 8);
      sim.issues = sim.issues.filter((i) => !toRemove.includes(i));
    }
  }
}

function buildPayload(sim: SimState): AutomationStatusPayload {
  const now = new Date().toISOString();
  const stalledActorTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();

  const items: WorkItem[] = sim.issues.map((issue) => ({
    id: `openreactor:issue:${issue.number}`,
    kind: issue.artifactKind,
    label: issue.title,
    state: issue.state,
    currentNodeId: displayNodeId(issue),
    assignedActorId: issue.agentIdx !== null
      ? `openreactor:actor:${issue.number}`
      : (issue.stage === "triage-planning" && issue.plannerActive)
        ? `openreactor:actor:planner:${issue.number}`
        : (issue.stage === "triage-planning" && issue.state === "running")
          ? `openreactor:actor:triage:${issue.number}`
          : undefined,
    enteredStateAt: now,
    updatedAt: now,
    retryCount: issue.retryCount,
    outcome: issue.outcome,
    relatedResourceUrls: [`https://github.com/example/repo/issues/${issue.number}`],
    metadata: issue.childIssues ? { childIssues: issue.childIssues } : undefined,
    extensions: {
      openreactor: {
        artifactKind: issue.artifactKind,
        issueNumber: issue.number,
        issueUrl: `https://github.com/example/repo/issues/${issue.number}`,
        branchName: issue.stage !== "intake" ? `openreactor/issue-${issue.number}` : undefined,
        pullRequestUrl: issue.artifactKind === "pull-request"
          ? `https://github.com/example/repo/pull/${issue.number}`
          : undefined,
        ...(issue.providerFallback ? { providerFallback: true } : {}),
        ...(issue.stalledHeartbeat ? { stalledHeartbeat: true } : {}),
        ...(issue.ciPending ? { ciPending: true } : {}),
        ...(issue.lastFailureKind ? { lastFailureKind: issue.lastFailureKind } : {}),
        ...(issue.childIssues ? { childIssues: issue.childIssues } : {}),
      },
    },
  }));

  const executionActors: ActorSnapshot[] = sim.issues
    .filter((i) => i.agentIdx !== null && i.stage === "execution")
    .map((issue) => {
      const tmpl = issue.providerFallback
        ? { ...AGENT_TEMPLATES[issue.agentIdx!], provider: "claude", label: "Claude Fallback", model: "claude-sonnet-4-6" }
        : AGENT_TEMPLATES[issue.agentIdx!];
      return {
        id: `openreactor:actor:${issue.number}`,
        kind: "agent" as const,
        label: tmpl.label,
        role: tmpl.role,
        status: issue.stalledHeartbeat ? "stalled" as const : "working" as const,
        currentNodeId: "execution",
        currentItemId: `openreactor:issue:${issue.number}`,
        provider: tmpl.provider,
        model: tmpl.model,
        startedAt: now,
        lastHeartbeatAt: issue.stalledHeartbeat ? stalledActorTime : now,
        extensions: {
          openreactor: {
            issueNumber: issue.number,
            toolLabel: tmpl.label,
            iteration: issue.retryCount + 1,
            ...(issue.providerFallback ? { providerFallback: true, originalProvider: "codex" } : {}),
          },
        },
      };
    });

  const triageActors: ActorSnapshot[] = sim.issues
    .filter((i) => i.stage === "triage-planning" && i.state === "running" && !i.plannerActive)
    .map((issue) => ({
      id: `openreactor:actor:triage:${issue.number}`,
      kind: "agent" as const,
      label: "Codex Triage",
      role: "planning",
      status: "working" as const,
      currentNodeId: "triage-planning",
      currentItemId: `openreactor:issue:${issue.number}`,
      provider: "codex",
      model: "gpt-5.5",
      startedAt: now,
      lastHeartbeatAt: now,
      extensions: {
        openreactor: {
          issueNumber: issue.number,
          toolLabel: "Codex Triage",
        },
      },
    }));

  // Planner agents — called over by triage to decompose large issues
  const plannerActors: ActorSnapshot[] = sim.issues
    .filter((i) => i.stage === "triage-planning" && i.plannerActive)
    .map((issue) => ({
      id: `openreactor:actor:planner:${issue.number}`,
      kind: "agent" as const,
      label: "Codex Planner",
      role: "planning",
      status: "working" as const,
      currentNodeId: "triage-planning",
      currentItemId: `openreactor:issue:${issue.number}`,
      provider: "codex",
      model: "gpt-5.5",
      startedAt: now,
      lastHeartbeatAt: now,
      extensions: {
        openreactor: {
          issueNumber: issue.number,
          toolLabel: "Codex Planner",
        },
      },
    }));

  const actors: ActorSnapshot[] = [...executionActors, ...triageActors, ...plannerActors];

  const executions: ExecutionSnapshot[] = actors.map((actor) => {
    const issue = sim.issues.find((i) => `openreactor:issue:${i.number}` === actor.currentItemId);
    return {
      id: `openreactor:execution:active:${actor.currentItemId}`,
      itemId: actor.currentItemId!,
      actorId: actor.id,
      nodeId: "execution",
      status: "running" as const,
      attempt: (issue?.retryCount ?? 0) + 1,
      startedAt: now,
      updatedAt: now,
    };
  });

  const incidents: IncidentSnapshot[] = [];

  // Maintainer handoffs → maintainer-handoff incidents
  for (const issue of sim.issues.filter((i) => i.stage === "waiting" && i.state === "waiting")) {
    incidents.push({
      id: `openreactor:incident:handoff:${issue.number}`,
      kind: "maintainer-handoff",
      label: `#${issue.number} needs maintainer review`,
      severity: "info",
      status: "active",
      scope: { nodeIds: ["waiting"], itemIds: [`openreactor:issue:${issue.number}`] },
      startedAt: now,
      reason: "PR requires manual merge conflict resolution",
      extensions: {
        openreactor: {
          prUrl: `https://github.com/example/repo/pull/${issue.number + 1}`,
          instructions: "Please resolve merge conflicts and approve the PR.",
        },
      },
    });
  }

  // Stalled heartbeat incidents
  for (const issue of sim.issues.filter((i) => i.stalledHeartbeat && i.stage === "execution")) {
    incidents.push({
      id: `openreactor:incident:stalled:${issue.number}`,
      kind: "stale-heartbeat",
      label: `#${issue.number} agent heartbeat stalled`,
      severity: "error",
      status: "active",
      scope: {
        nodeIds: ["execution"],
        itemIds: [`openreactor:issue:${issue.number}`],
        actorIds: [`openreactor:actor:${issue.number}`],
      },
      startedAt: now,
      reason: "No heartbeat for 15+ minutes",
    });
  }

  // CI failures — agent is auto-fixing
  for (const issue of sim.issues.filter((i) => i.stage === "execution" && i.state === "retrying" && i.lastFailureKind === "ci-failure")) {
    incidents.push({
      id: `openreactor:incident:ci-failure:${issue.number}`,
      kind: "ci-failure",
      label: `#${issue.number} CI failed — auto-fixing`,
      severity: "warning",
      status: "active",
      scope: {
        nodeIds: ["execution"],
        itemIds: [`openreactor:issue:${issue.number}`],
      },
      startedAt: now,
      reason: "Test suite failed. Agent is diagnosing and applying fixes.",
    });
  }

  // Merge conflicts — agent is auto-resolving
  for (const issue of sim.issues.filter((i) => i.stage === "execution" && i.state === "retrying" && i.lastFailureKind === "merge-conflict")) {
    incidents.push({
      id: `openreactor:incident:merge-conflict:${issue.number}`,
      kind: "merge-conflict",
      label: `#${issue.number} merge conflict — auto-resolving`,
      severity: "warning",
      status: "active",
      scope: {
        nodeIds: ["execution"],
        itemIds: [`openreactor:issue:${issue.number}`],
      },
      startedAt: now,
      reason: "PR has merge conflicts with main. Agent is rebasing and resolving.",
    });
  }

  // Rate limit cooldown — only affects GitHub-dependent nodes
  if (sim.rateLimited) {
    incidents.push({
      id: "openreactor:incident:rate-limit",
      kind: "rate-limit-cooldown",
      label: "GitHub API rate limited",
      severity: "error",
      status: "active",
      scope: { nodeIds: ["intake", "execution"], serviceIds: ["reactor"] },
      startedAt: now,
      reason: "GitHub API rate limit exceeded. Intake and PR merging paused.",
    });
  }

  const services: ServiceSnapshot[] = [
    {
      id: "reactor",
      label: "Reactor",
      status: sim.rateLimited ? "cooldown" : "healthy",
      active: !sim.rateLimited,
      updatedAt: now,
      restarts: 0,
      cooldownUntil: sim.rateLimited ? new Date(Date.now() + sim.rateLimitTicks * 2000).toISOString() : null,
    },
    {
      id: "watchdog",
      label: "Watchdog",
      status: "healthy",
      active: true,
      updatedAt: now,
      restarts: 0,
    },
  ];

  const nodeItemCounts = new Map<string, number>();
  for (const item of items) {
    if (item.currentNodeId) {
      nodeItemCounts.set(item.currentNodeId, (nodeItemCounts.get(item.currentNodeId) ?? 0) + 1);
    }
  }

  const nodes = TOPOLOGY_NODES.map((n) => {
    const count = nodeItemCounts.get(n.id) ?? 0;
    const nodeItems = items.filter((i) => i.currentNodeId === n.id);
    const hasIncident = incidents.some((inc) => inc.scope.nodeIds?.includes(n.id));
    return {
      ...n,
      status: (hasIncident ? "degraded" : "healthy") as "healthy" | "degraded",
      counts: { totalItems: count, active: count },
      samples: {
        items: {
          itemIds: nodeItems.slice(0, 6).map((i) => i.id),
          visibleCount: Math.min(nodeItems.length, 6),
          truncated: nodeItems.length > 6,
        },
      },
    };
  });

  const systemStatus = sim.rateLimited ? "degraded" : incidents.some((i) => i.severity === "error") ? "degraded" : "healthy";

  return {
    specVersion: "automation-status/v1",
    generatedAt: now,
    system: {
      id: "openreactor",
      name: "OpenReactor",
      kind: "autonomous-software-delivery",
      status: systemStatus as "healthy" | "degraded",
    },
    topology: {
      nodes,
      edges: TOPOLOGY_EDGES.map((e) => ({ ...e, status: "healthy" as const })),
    },
    snapshot: { items, actors, executions, incidents, services },
    activity: { recentEvents: [] },
    metrics: {
      totals: { activeAgents: actors.length, blockedItems: incidents.length },
      capacities: { maxConcurrentIssues: 3 },
    },
    extensions: {
      openreactor: {
        repo: { owner: "example", repo: "repo" },
        nodeOrder: ["intake", "triage-planning", "execution", "waiting", "completed", "rejected", "watchdog"],
      },
    },
  };
}

function displayNodeId(issue: SimIssue): Stage | undefined {
  if (issue.stage === "decomposed") {
    return undefined;
  }

  return issue.stage;
}

export function createSimulation(onTick: (payload: AutomationStatusPayload) => void, intervalMs = 2000) {
  const sim = createSimState();
  for (let i = 0; i < 4; i++) sim.issues.push(spawnIssue(sim));
  for (let i = 0; i < 6; i++) advanceSim(sim);

  let timer: ReturnType<typeof setInterval> | null = null;

  function tick() {
    advanceSim(sim);
    onTick(buildPayload(sim));
  }

  return {
    start() { tick(); timer = setInterval(tick, intervalMs); },
    stop() { if (timer !== null) { clearInterval(timer); timer = null; } },
    tick,
  };
}
