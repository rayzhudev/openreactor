import type {
  WorkflowNode,
  WorkflowEdge,
  LayoutNode,
  LayoutEdge,
  NodeKind,
} from "../types";

const NODE_SIZES: Record<NodeKind, { gw: number; gh: number }> = {
  source: { gw: 3, gh: 3 },
  processor: { gw: 7, gh: 3 },
  queue: { gw: 3, gh: 3 },
  router: { gw: 3, gh: 3 },
  sink: { gw: 3, gh: 3 },
  store: { gw: 3, gh: 3 },
  supervisor: { gw: 3, gh: 3 },
  scheduler: { gw: 3, gh: 3 },
  integration: { gw: 3, gh: 3 },
  "human-gate": { gw: 3, gh: 3 },
};

const H_GAP = 4;
const V_GAP = 3;
const MAIN_ROW_Y = 4;
const SIDE_OUTPUT_GAP = 1;

export interface GraphLayout {
  nodes: Map<string, LayoutNode>;
  edges: Map<string, LayoutEdge>;
}

export function computeLayout(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): GraphLayout {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  // Detect backward handoff edges (target is a source node) — these create
  // feedback loops (e.g. decompose back to intake) and must be excluded from
  // topo sort so they don't create cycles.
  const backwardHandoffIds = new Set(
    edges
      .filter((e) => e.kind === "handoff" && nodeMap.get(e.toNodeId)?.kind === "source")
      .map((e) => e.id)
  );
  const forwardEdges = edges.filter(
    (e) => (e.kind === "flow" || e.kind === "handoff") && !backwardHandoffIds.has(e.id)
  );
  const retryEdges = edges.filter((e) => e.kind === "retry");
  const controlEdges = edges.filter((e) => e.kind === "control");

  // Skip supervisor (rendered as watchdog) and retry queue (rendered as drone failure/respawn)
  const skipNodeIds = new Set<string>();
  for (const n of nodes) {
    if (n.kind === "supervisor") skipNodeIds.add(n.id);
    if (n.kind === "sink") skipNodeIds.add(n.id);
    if (n.kind === "queue") skipNodeIds.add(n.id);
  }
  // Find retry nodes: nodes that only have retry edges connecting them
  for (const n of nodes) {
    const hasNonRetryEdge = edges.some(
      (e) => (e.fromNodeId === n.id || e.toNodeId === n.id) && e.kind !== "retry"
    );
    if (!hasNonRetryEdge && edges.some((e) => (e.fromNodeId === n.id || e.toNodeId === n.id) && e.kind === "retry")) {
      skipNodeIds.add(n.id);
    }
  }

  const visibleNodes = nodes.filter((n) => !skipNodeIds.has(n.id));
  const sorted = topoSort(visibleNodes, forwardEdges);
  const mainFlow = classifyMainFlow(sorted, forwardEdges, nodeMap);
  const branchNodes = classifyBranches(sorted, mainFlow, forwardEdges, retryEdges, controlEdges);

  const layoutNodes = new Map<string, LayoutNode>();
  let cursorX = 1;

  for (const id of mainFlow) {
    const node = nodeMap.get(id);
    if (!node) continue;
    const size = NODE_SIZES[node.kind] ?? { gw: 4, gh: 3 };
    layoutNodes.set(id, {
      id,
      kind: node.kind,
      label: node.label,
      status: node.status,
      gx: cursorX,
      gy: MAIN_ROW_Y,
      gw: size.gw,
      gh: size.gh,
      node,
    });
    cursorX += size.gw + H_GAP;
  }

  let belowY = MAIN_ROW_Y;
  for (const ln of layoutNodes.values()) {
    belowY = Math.max(belowY, ln.gy + ln.gh);
  }
  belowY += V_GAP;

  // Place branch nodes on a row below main flow.
  // First pass: determine target X from main-flow connections.
  // Second pass: resolve nodes connected only to other branch nodes.
  const branchTargetX = new Map<string, number>();

  for (const id of branchNodes) {
    if (layoutNodes.has(id)) continue;
    const x = findBranchX(id, edges, layoutNodes);
    branchTargetX.set(id, x);
  }

  // Second pass: nodes whose X is still 1 (default) try to resolve from other branch targets
  for (const id of branchNodes) {
    if ((branchTargetX.get(id) ?? 1) > 1) continue;
    for (const e of edges) {
      if (e.toNodeId === id && branchTargetX.has(e.fromNodeId)) {
        const fromX = branchTargetX.get(e.fromNodeId)!;
        if (fromX > 1) { branchTargetX.set(id, fromX); break; }
      }
      if (e.fromNodeId === id && branchTargetX.has(e.toNodeId)) {
        const toX = branchTargetX.get(e.toNodeId)!;
        if (toX > 1) { branchTargetX.set(id, toX); break; }
      }
    }
  }

  // Place branch nodes on a single row, sorted by target X.
  // If two nodes share the same target X, offset the second one to the right.
  // Sort branch nodes: nodes with direct edges from main flow first, then
  // nodes connected only to other branch nodes. Within each group, sort by X.
  const mainFlowSet = new Set(mainFlow);
  const hasMainFlowEdge = (id: string) =>
    edges.some(
      (e) =>
        (e.toNodeId === id && mainFlowSet.has(e.fromNodeId)) ||
        (e.fromNodeId === id && mainFlowSet.has(e.toNodeId))
    );

  const branchEntries = [...branchTargetX.entries()]
    .map(([id, targetX]) => ({ id, targetX, priority: hasMainFlowEdge(id) ? 0 : 1 }))
    .sort((a, b) => a.priority - b.priority || a.targetX - b.targetX);

  let branchCursorX = 0;
  let branchRowBottom = belowY;
  for (const { id, targetX } of branchEntries) {
    const node = nodeMap.get(id);
    if (!node) continue;
    const size = NODE_SIZES[node.kind] ?? { gw: 4, gh: 3 };

    // Center branch node below its main-flow source when possible
    const sourceEdge = edges.find(
      (e) => e.toNodeId === id && (e.kind === "flow" || e.kind === "handoff") && layoutNodes.has(e.fromNodeId)
    );
    const sourceLayout = sourceEdge ? layoutNodes.get(sourceEdge.fromNodeId) : undefined;
    const centeredX = sourceLayout
      ? sourceLayout.gx + Math.floor((sourceLayout.gw - size.gw) / 2)
      : undefined;
    const useRetryLoopPocket =
      node.kind === "human-gate" &&
      sourceLayout &&
      hasSelfRetryLoop(sourceLayout.id, edges);
    const gx = useRetryLoopPocket
      ? centeredRetryLoopPocketX(sourceLayout!, size.gw)
      : Math.max(branchCursorX, centeredX ?? targetX);
    const gy = useRetryLoopPocket
      ? sourceLayout!.gy + sourceLayout!.gh + V_GAP
      : belowY;

    layoutNodes.set(id, {
      id,
      kind: node.kind,
      label: node.label,
      status: node.status,
      gx,
      gy,
      gw: size.gw,
      gh: size.gh,
      node,
    });
    branchCursorX = gx + size.gw + H_GAP;
    branchRowBottom = Math.max(branchRowBottom, gy + size.gh);
  }

  belowY = branchRowBottom + V_GAP;

  // Place any remaining unplaced nodes (sinks, supervisors, etc.)
  // Find the rightmost main-flow node to position sinks after it
  let mainFlowMaxX = 0;
  for (const ln of layoutNodes.values()) {
    mainFlowMaxX = Math.max(mainFlowMaxX, ln.gx + ln.gw);
  }

  // Identify sinks that are side-outputs (their source also feeds forward
  // into the main flow). These get placed directly below their source node
  // for a straight vertical belt. Terminal sinks go to the right.
  const sinkSources = new Map<string, string[]>();
  for (const e of edges) {
    if (e.kind === "flow" || e.kind === "handoff") {
      const toNode = nodeMap.get(e.toNodeId);
      if (toNode?.kind === "sink") {
        const list = sinkSources.get(e.toNodeId) ?? [];
        list.push(e.fromNodeId);
        sinkSources.set(e.toNodeId, list);
      }
    }
  }

  // A sink is a "side-output" if it has exactly one source and that source
  // still feeds forward through another non-sink flow edge in the main line.
  // Handoffs and retry loops should not pull terminal sinks under the
  // processor, otherwise the final merged sink drifts away from the output end.
  const sideOutputSinks = new Set<string>();
  for (const [sinkId, sources] of sinkSources) {
    if (sources.length !== 1) continue;
    const srcId = sources[0];
    const hasOtherFlow = edges.some(
      (e) => e.fromNodeId === srcId &&
             e.kind === "flow" &&
             e.toNodeId !== sinkId &&
             nodeMap.get(e.toNodeId)?.kind !== "sink"
    );
    if (hasOtherFlow) sideOutputSinks.add(sinkId);
  }

  const sideOutputGroups = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.kind !== "sink" || !sideOutputSinks.has(node.id)) continue;
    const sourceId = sinkSources.get(node.id)?.[0];
    if (!sourceId) continue;
    const group = sideOutputGroups.get(sourceId) ?? [];
    group.push(node.id);
    sideOutputGroups.set(sourceId, group);
  }

  const sideOutputPlacement = new Map<string, { gx: number; gy: number }>();
  for (const [sourceId, sinkIds] of sideOutputGroups) {
    const sourceLayout = layoutNodes.get(sourceId);
    if (!sourceLayout) continue;
    const totalWidth = sinkIds.reduce((sum, sinkId) => {
      const sinkNode = nodeMap.get(sinkId);
      const sinkSize = sinkNode ? (NODE_SIZES[sinkNode.kind] ?? { gw: 4, gh: 3 }) : { gw: 4, gh: 3 };
      return sum + sinkSize.gw;
    }, 0) + SIDE_OUTPUT_GAP * Math.max(0, sinkIds.length - 1);
    let cursorGX = sourceLayout.gx + Math.floor((sourceLayout.gw - totalWidth) / 2);

    for (const sinkId of sinkIds) {
      const sinkNode = nodeMap.get(sinkId);
      const sinkSize = sinkNode ? (NODE_SIZES[sinkNode.kind] ?? { gw: 4, gh: 3 }) : { gw: 4, gh: 3 };
      sideOutputPlacement.set(sinkId, { gx: cursorGX, gy: belowY });
      cursorGX += sinkSize.gw + SIDE_OUTPUT_GAP;
    }
  }

  let defaultSinkX = mainFlowMaxX + H_GAP;
  let sinkCursorY = MAIN_ROW_Y;
  for (const node of nodes) {
    if (layoutNodes.has(node.id)) continue;
    const size = NODE_SIZES[node.kind] ?? { gw: 4, gh: 3 };
    if (node.kind === "sink") {
      const isSideOutput = sideOutputSinks.has(node.id);
      const placement = isSideOutput ? sideOutputPlacement.get(node.id) : undefined;
      const gx = placement?.gx ?? defaultSinkX;
      const gy = placement?.gy ?? sinkCursorY;

      layoutNodes.set(node.id, {
        id: node.id,
        kind: node.kind,
        label: node.label,
        status: node.status,
        gx,
        gy,
        gw: size.gw,
        gh: size.gh,
        node,
      });

      if (!placement) {
        sinkCursorY += size.gh + V_GAP;
      }
    } else {
      layoutNodes.set(node.id, {
        id: node.id,
        kind: node.kind,
        label: node.label,
        status: node.status,
        gx: 1,
        gy: belowY,
        gw: size.gw,
        gh: size.gh,
        node,
      });
      belowY += size.gh + V_GAP;
    }
  }

  const layoutEdges = new Map<string, LayoutEdge>();
  for (const edge of edges) {
    layoutEdges.set(edge.id, {
      id: edge.id,
      kind: edge.kind,
      from: edge.fromNodeId,
      to: edge.toNodeId,
      status: edge.status ?? "unknown",
      edge,
    });
  }

  return { nodes: layoutNodes, edges: layoutEdges };
}

function topoSort(nodes: WorkflowNode[], forwardEdges: WorkflowEdge[]): string[] {
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();

  for (const n of nodes) {
    adj.set(n.id, []);
    inDeg.set(n.id, 0);
  }

  for (const e of forwardEdges) {
    adj.get(e.fromNodeId)?.push(e.toNodeId);
    inDeg.set(e.toNodeId, (inDeg.get(e.toNodeId) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDeg) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    for (const next of adj.get(id) ?? []) {
      const newDeg = (inDeg.get(next) ?? 1) - 1;
      inDeg.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }

  for (const n of nodes) {
    if (!sorted.includes(n.id)) sorted.push(n.id);
  }

  return sorted;
}

function classifyMainFlow(
  sorted: string[],
  forwardEdges: WorkflowEdge[],
  nodeMap: Map<string, WorkflowNode>
): string[] {
  const targets = new Set(forwardEdges.map((e) => e.toNodeId));
  const sources = new Set(forwardEdges.map((e) => e.fromNodeId));

  const starts = sorted.filter(
    (id) => !targets.has(id) || nodeMap.get(id)?.kind === "source"
  );
  const start = starts[0] ?? sorted[0];
  if (!start) return [];

  const adj = new Map<string, string[]>();
  for (const e of forwardEdges) {
    const list = adj.get(e.fromNodeId) ?? [];
    list.push(e.toNodeId);
    adj.set(e.fromNodeId, list);
  }

  const main: string[] = [];
  const visited = new Set<string>();
  let current: string | undefined = start;

  while (current && !visited.has(current)) {
    visited.add(current);
    main.push(current);
    const nexts: string[] = (adj.get(current) ?? []).filter((n: string) => !visited.has(n));
    const flowNext: string | undefined = nexts.find((n: string) => {
      const node = nodeMap.get(n);
      return node?.kind === "processor" || node?.kind === "sink";
    });
    current = flowNext ?? nexts[0];
  }

  return main;
}

function classifyBranches(
  sorted: string[],
  mainFlow: string[],
  forwardEdges: WorkflowEdge[],
  retryEdges: WorkflowEdge[],
  controlEdges: WorkflowEdge[]
): string[] {
  const mainSet = new Set(mainFlow);
  const secondaryIds = new Set<string>();

  for (const e of [...forwardEdges, ...retryEdges, ...controlEdges]) {
    if (!mainSet.has(e.fromNodeId)) secondaryIds.add(e.fromNodeId);
    if (!mainSet.has(e.toNodeId)) secondaryIds.add(e.toNodeId);
  }

  return sorted.filter((id) => secondaryIds.has(id) && !mainSet.has(id));
}

function findBranchX(
  nodeId: string,
  edges: WorkflowEdge[],
  layoutNodes: Map<string, LayoutNode>
): number {
  // Prefer the X of a main-flow node that has an edge to/from this branch node
  // Check incoming edges first (the node that sends items here)
  for (const e of edges) {
    if (e.toNodeId === nodeId && (e.kind === "flow" || e.kind === "retry" || e.kind === "handoff")) {
      const from = layoutNodes.get(e.fromNodeId);
      if (from) return from.gx;
    }
  }
  // Then outgoing edges
  for (const e of edges) {
    if (e.fromNodeId === nodeId && (e.kind === "flow" || e.kind === "retry")) {
      const to = layoutNodes.get(e.toNodeId);
      if (to) return to.gx;
    }
  }
  // Finally control edges (supervisor → target)
  for (const e of edges) {
    if (e.fromNodeId === nodeId && e.kind === "control") {
      const to = layoutNodes.get(e.toNodeId);
      if (to) return to.gx;
    }
  }
  return 1;
}

function hasSelfRetryLoop(nodeId: string, edges: WorkflowEdge[]): boolean {
  return edges.some(
    (edge) =>
      edge.kind === "retry" &&
      edge.fromNodeId === nodeId &&
      edge.toNodeId === nodeId
  );
}

function centeredRetryLoopPocketX(sourceLayout: LayoutNode, branchWidth: number): number {
  const leftTurnGX = sourceLayout.gx - 2;
  const rightTurnGX = sourceLayout.gx + sourceLayout.gw - 2;
  return Math.round((leftTurnGX + rightTurnGX - branchWidth) / 2);
}
