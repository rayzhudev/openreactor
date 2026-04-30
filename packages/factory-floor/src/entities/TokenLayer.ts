import type { FloorState, WorkItem, LayoutNode, LayoutEdge } from "../types";
import type { TokenVisualKind } from "../assets/token-theme";
import { resolveItemVisualKind } from "../assets/token-theme";
import { rectToPx, slotCenter, snapToCellCenter } from "../layout/grid";

const CELL = 25;
const HALF = 12;
const TOKEN_SIZE = 21;
const TOKEN_OFFSET = Math.floor((CELL - TOKEN_SIZE) / 2);
const MAX_VISIBLE_QUEUED = 5; // show this many tokens individually, then stack the rest
const MAX_VISIBLE_SINK_ITEMS = 3;

interface TokenAnim {
  itemId: string;
  pathPoints: Array<{ x: number; y: number }>;
  totalLength: number;
  startTime: number;
  duration: number;
}

export class TokenLayer {
  private container: HTMLElement;
  private tokenEls = new Map<string, HTMLElement>();
  private stackEls = new Map<string, HTMLElement>();
  private sinkLabelEls = new Map<string, HTMLElement>();
  private prevNodeMap = new Map<string, string>();
  private activeAnims = new Map<string, TokenAnim>();
  private animFrame: number | null = null;
  private state: FloorState | null = null;

  constructor(parent: HTMLElement) {
    this.container = document.createElement("div");
    this.container.classList.add("ff-tokens");
    this.container.style.position = "absolute";
    this.container.style.inset = "0";
    parent.appendChild(this.container);
  }

  update(state: FloorState) {
    const prevState = this.state;
    this.state = state;
    const activeIds = new Set<string>();

    for (const [id, item] of state.items) {
      activeIds.add(id);
      let el = this.tokenEls.get(id);
      if (!el) {
        el = createTokenEl(item);
        this.container.appendChild(el);
        this.tokenEls.set(id, el);
      }

      updateTokenClasses(el, item);

      const prevNodeId = this.prevNodeMap.get(id);
      const currNodeId = item.currentNodeId;

      if (prevNodeId && currNodeId && prevNodeId !== currNodeId && !this.activeAnims.has(id)) {
        const path = findBeltPath(prevNodeId, currNodeId, state);
        if (path.length >= 2) {
          this.startTransit(id, path);
        } else {
          this.positionToken(el, item, state);
        }
      } else if (!this.activeAnims.has(id)) {
        this.positionToken(el, item, state);
      }

      this.prevNodeMap.set(id, currNodeId ?? "");
    }

    for (const [id, el] of this.tokenEls) {
      if (!activeIds.has(id)) {
        el.remove();
        this.tokenEls.delete(id);
        this.prevNodeMap.delete(id);
        this.activeAnims.delete(id);
      }
    }

    this.updateStacks(state);
    this.updateSinkLabels(state);

    if (this.activeAnims.size > 0 && this.animFrame === null) {
      this.animFrame = requestAnimationFrame(() => this.tickAnims());
    }
  }

  private updateStacks(state: FloorState) {
    const activeStackNodes = new Set<string>();

    for (const [nodeId, node] of state.nodes) {
      const queuedItems = getQueuedItemsAtNode(nodeId, state);
      const totalQueued = queuedItems.length;

      if (totalQueued <= MAX_VISIBLE_QUEUED) {
        // No stack needed — show all tokens, hide stack element
        for (const item of queuedItems) {
          const el = this.tokenEls.get(item.id);
          if (el) el.style.display = "";
        }
        continue;
      }

      activeStackNodes.add(nodeId);

      // Hide tokens beyond the visible limit
      for (let i = 0; i < queuedItems.length; i++) {
        const el = this.tokenEls.get(queuedItems[i].id);
        if (!el) continue;
        if (i >= MAX_VISIBLE_QUEUED) {
          el.style.display = "none";
        } else {
          el.style.display = "";
        }
      }

      // Create or update the stack indicator
      const overflowCount = totalQueued - MAX_VISIBLE_QUEUED;
      let stackEl = this.stackEls.get(nodeId);
      if (!stackEl) {
        stackEl = document.createElement("div");
        stackEl.classList.add("ff-token-stack");
        this.container.appendChild(stackEl);
        this.stackEls.set(nodeId, stackEl);
      }

      stackEl.innerHTML = `
        <div class="ff-token-stack__cards">
          <div class="ff-token-stack__card"></div>
          <div class="ff-token-stack__card"></div>
          <div class="ff-token-stack__card"></div>
        </div>
        <div class="ff-token-stack__count">+${overflowCount}</div>
      `;
      stackEl.className = `ff-token-stack ff-token-stack--${resolveItemVisualKind(queuedItems[0])}`;

      // Position the stack at the end of the visible queue
      const stackPos = getStackPosition(node, state);
      stackEl.style.transform = `translate(${stackPos.x}px, ${stackPos.y}px)`;
    }

    // Remove stacks for nodes that no longer overflow
    for (const [nodeId, el] of this.stackEls) {
      if (!activeStackNodes.has(nodeId)) {
        el.remove();
        this.stackEls.delete(nodeId);
      }
    }
  }

  private positionToken(el: HTMLElement, item: WorkItem, state: FloorState) {
    if (!item.currentNodeId) return;

    el.classList.remove("ff-token--belt");
    el.classList.remove("ff-token--static");

    // Retrying items: show at the execution node (where the drone failed)
    // instead of the retry queue node
    const effectiveNodeId = resolveDisplayNode(item, state);
    const node = state.nodes.get(effectiveNodeId);
    if (!node) return;
    el.style.display = "";

    if (node.kind === "sink") {
      el.classList.add("ff-token--static");
      const pos = sinkPilePosition(node, item, state);
      if (!pos) {
        el.style.display = "none";
        return;
      }
      el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      return;
    }

    // Retrying/failed items go back on the incoming belt — the system will
    // assign a new agent to handle them automatically
    // Only truly human-blocked items (paused, waiting, blocked) sit below the node
  const isHumanBlocked = item.state === "paused" || item.state === "waiting" || item.state === "blocked";
  if (isHumanBlocked) {
    if (node.kind === "human-gate") {
      el.classList.add("ff-token--static");
      const px = rectToPx(node);
      const stuckItems = [...state.items.values()].filter(
        (i) => (i.state === "paused" || i.state === "waiting" || i.state === "blocked") &&
               resolveDisplayNode(i, state) === effectiveNodeId
      );
      const idx = stuckItems.indexOf(item);
      if (stuckItems.length <= 1) {
        el.style.transform = `translate(${px.x + Math.round((px.w - TOKEN_SIZE) / 2)}px, ${px.y + Math.round((px.h - TOKEN_SIZE) / 2)}px)`;
        return;
      }

      const col = idx % 2;
      const row = Math.floor(idx / 2);
      el.style.transform = `translate(${px.x + 11 + col * 22}px, ${px.y + 11 + row * 22}px)`;
      return;
    }

    const px = rectToPx(node);
    el.classList.add("ff-token--static");
    const stuckItems = [...state.items.values()].filter(
      (i) => (i.state === "paused" || i.state === "waiting" || i.state === "blocked") &&
               resolveDisplayNode(i, state) === effectiveNodeId
      );
      const idx = stuckItems.indexOf(item);
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      el.style.transform = `translate(${px.x + col * CELL + TOKEN_OFFSET}px, ${px.y + px.h + CELL + row * CELL + TOKEN_OFFSET}px)`;
      return;
    }

    // Only items with an assigned actor that exists in state belong at a seat
    if (item.assignedActorId) {
      const actor = state.actors.get(item.assignedActorId);
      if (actor?.currentNodeId) {
        const actorNode = state.nodes.get(actor.currentNodeId);
        if (actorNode) {
          el.classList.add("ff-token--static");
          const seat = tokenSeatPosition(actor, actorNode, state);
          el.style.transform = `translate(${seat.x}px, ${seat.y}px)`;
          return;
        }
      }
    }

    // CI-pending items sit on the outgoing belt (right side of node)
    const ext = item.extensions?.openreactor as Record<string, unknown> | undefined;
    if (ext?.ciPending) {
      el.classList.add("ff-token--belt");
      const pos = outgoingBeltPosition(node, item, state);
      el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      return;
    }

    // Everything else goes on the incoming belt queue
    el.classList.add("ff-token--belt");
    const pos = beltQueuePosition(node, item, state);
    el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  }

  private startTransit(itemId: string, pathPoints: Array<{ x: number; y: number }>) {
    let totalLength = 0;
    for (let i = 1; i < pathPoints.length; i++) {
      totalLength += Math.hypot(
        pathPoints[i].x - pathPoints[i - 1].x,
        pathPoints[i].y - pathPoints[i - 1].y
      );
    }

    const speed = 150; // px per second
    const duration = Math.max(400, (totalLength / speed) * 1000);

    this.activeAnims.set(itemId, {
      itemId,
      pathPoints,
      totalLength,
      startTime: performance.now(),
      duration,
    });

    const el = this.tokenEls.get(itemId);
    if (el) {
      el.classList.add("ff-token--transit");
      el.classList.add("ff-token--belt");
      el.classList.remove("ff-token--static");
      el.style.transition = "none";
    }
  }

  private tickAnims() {
    this.animFrame = null;
    const now = performance.now();
    const done: string[] = [];

    for (const [id, anim] of this.activeAnims) {
      const el = this.tokenEls.get(id);
      if (!el) { done.push(id); continue; }

      const elapsed = now - anim.startTime;
      const t = Math.min(1, elapsed / anim.duration);
      const eased = t < 1 ? t * (2 - t) : 1; // ease-out

      const pos = pointAlongPath(anim.pathPoints, anim.totalLength, eased);
      el.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`;

      if (t >= 1) {
        done.push(id);
        el.classList.remove("ff-token--transit");
        el.style.transition = "";
        // Snap to final position
        if (this.state) {
          const item = this.state.items.get(id);
          if (item) this.positionToken(el, item, this.state);
        }
      }
    }

    for (const id of done) {
      this.activeAnims.delete(id);
    }

    if (this.activeAnims.size > 0) {
      this.animFrame = requestAnimationFrame(() => this.tickAnims());
    }
  }

  private updateSinkLabels(state: FloorState) {
    const activeSinks = new Set<string>();

    for (const [nodeId, node] of state.nodes) {
      if (node.kind !== "sink") continue;
      activeSinks.add(nodeId);

      const sinkItems = [...state.items.values()].filter(
        (i) => i.currentNodeId === nodeId
      );

      let labelEl = this.sinkLabelEls.get(nodeId);
      if (!labelEl) {
        labelEl = document.createElement("div");
        labelEl.classList.add("ff-sink-label");
        this.container.appendChild(labelEl);
        this.sinkLabelEls.set(nodeId, labelEl);
      }

      const px = rectToPx(node);
      labelEl.style.transform = `translate(${px.x}px, ${px.y + CELL + TOKEN_OFFSET}px)`;
      const sinkName = node.label || nodeId;
      labelEl.textContent = sinkItems.length > 0 ? `${sinkName} (${sinkItems.length})` : sinkName;
    }

    for (const [id, el] of this.sinkLabelEls) {
      if (!activeSinks.has(id)) {
        el.remove();
        this.sinkLabelEls.delete(id);
      }
    }
  }

  destroy() {
    if (this.animFrame !== null) cancelAnimationFrame(this.animFrame);
    this.container.remove();
  }
}

function resolveDisplayNode(item: WorkItem, state: FloorState): string {
  if (!item.currentNodeId) return "";
  const node = state.nodes.get(item.currentNodeId);
  if (!node) return item.currentNodeId;

  // Items at retry/queue nodes: redirect to the processor that feeds them
  // so they display in-place at execution rather than at a hidden node
  if (node.kind === "queue") {
    for (const edge of state.edges.values()) {
      if ((edge.kind === "retry" || edge.kind === "handoff" || edge.kind === "flow") && edge.to === item.currentNodeId) {
        const fromNode = state.nodes.get(edge.from);
        if (fromNode?.kind === "processor") return edge.from;
      }
    }
  }

  return item.currentNodeId;
}

function getQueuedItemsAtNode(nodeId: string, state: FloorState): WorkItem[] {
  return [...state.items.values()].filter((i) => {
    if (i.currentNodeId !== nodeId) return false;
    if (i.state === "succeeded") return false;
    // Items with an active assigned actor are seated inside the node
    if (i.assignedActorId && state.actors.has(i.assignedActorId)) return false;
    // CI-pending items are on the outgoing belt, not the incoming belt
    const ext = i.extensions?.openreactor as Record<string, unknown> | undefined;
    if (ext?.ciPending) return false;
    // Human-blocked items sit below the node, not on the belt
    if (i.state === "paused" || i.state === "waiting" || i.state === "blocked") return false;
    // Everything else (queued, retrying, failed) goes on the incoming belt
    return true;
  });
}

function getCiPendingItems(nodeId: string, state: FloorState): WorkItem[] {
  return [...state.items.values()].filter((i) => {
    if (i.currentNodeId !== nodeId) return false;
    const ext = i.extensions?.openreactor as Record<string, unknown> | undefined;
    return Boolean(ext?.ciPending);
  });
}

function outgoingBeltPosition(
  node: LayoutNode,
  item: WorkItem,
  state: FloorState
): { x: number; y: number } {
  const ciItems = getCiPendingItems(node.id, state);
  const idx = Math.min(ciItems.indexOf(item), MAX_VISIBLE_QUEUED - 1);

  const outSlot = slotCenter(node, "right");
  return {
    x: outSlot.x + (idx + 1) * CELL + TOKEN_OFFSET,
    y: outSlot.y - HALF + TOKEN_OFFSET,
  };
}

function beltQueuePosition(
  node: LayoutNode,
  item: WorkItem,
  state: FloorState
): { x: number; y: number } {
  const queuedItems = getQueuedItemsAtNode(node.id, state);
  const idx = Math.min(queuedItems.indexOf(item), MAX_VISIBLE_QUEUED - 1);

  if (node.kind === "source") {
    const outSlot = slotCenter(node, "right");
    return {
      x: outSlot.x + idx * CELL + TOKEN_OFFSET,
      y: outSlot.y - HALF + TOKEN_OFFSET,
    };
  }

  const inSlot = slotCenter(node, "left");
  return {
    x: inSlot.x - (idx + 1) * CELL + TOKEN_OFFSET,
    y: inSlot.y - HALF + TOKEN_OFFSET,
  };
}

function getStackPosition(
  node: LayoutNode,
  state: FloorState
): { x: number; y: number } {
  if (node.kind === "source") {
    const outSlot = slotCenter(node, "right");
    return {
      x: outSlot.x + MAX_VISIBLE_QUEUED * CELL + TOKEN_OFFSET,
      y: outSlot.y - HALF + TOKEN_OFFSET,
    };
  }

  const inSlot = slotCenter(node, "left");
  return {
    x: inSlot.x - (MAX_VISIBLE_QUEUED + 1) * CELL + TOKEN_OFFSET,
    y: inSlot.y - HALF + TOKEN_OFFSET,
  };
}

function sinkPilePosition(
  node: LayoutNode,
  item: WorkItem,
  state: FloorState
): { x: number; y: number } | null {
  const px = rectToPx(node);
  const sinkItems = [...state.items.values()].filter(
    (i) => i.currentNodeId === node.id
  );
  const idx = sinkItems.indexOf(item);
  const hiddenCount = Math.max(0, sinkItems.length - MAX_VISIBLE_SINK_ITEMS);
  if (idx < hiddenCount) return null;

  const visibleIdx = idx - hiddenCount;
  const offsets = [
    { x: 10, y: 10 },
    { x: 32, y: 18 },
    { x: 20, y: 36 },
  ];
  const offset = offsets[visibleIdx] ?? offsets[offsets.length - 1];

  return {
    x: px.x + offset.x,
    y: px.y + offset.y,
  };
}

function tokenSeatPosition(
  actor: { id: string; currentNodeId?: string },
  node: LayoutNode,
  state: FloorState
): { x: number; y: number } {
  const px = rectToPx(node);
  const seatCount = node.node.capacity?.maxConcurrency ?? 3;
  const workingActors = [...state.actors.values()].filter(
    (a) => a.currentNodeId === node.id
  );
  const idx = Math.max(0, workingActors.findIndex((a) => a.id === actor.id));

  const seatW = CELL * 2;
  const totalSeatsW = seatCount * seatW;
  const startX = px.x + (px.w - totalSeatsW) / 2;

  return {
    x: startX + idx * seatW + TOKEN_OFFSET,
    y: px.y + TOKEN_OFFSET,
  };
}

function findBeltPath(
  fromNodeId: string,
  toNodeId: string,
  state: FloorState
): Array<{ x: number; y: number }> {
  const fromNode = state.nodes.get(fromNodeId);
  const toNode = state.nodes.get(toNodeId);
  if (!fromNode || !toNode) return [];

  if (fromNode.kind === "processor" && toNode.kind === "human-gate") {
    return executionToWaitingPath(fromNode, toNode);
  }

  if (fromNode.kind === "human-gate" && toNode.kind === "processor") {
    return waitingToExecutionPath(fromNode, toNode);
  }

  const start = slotCenter(fromNode, "right");
  const end = slotCenter(toNode, "left");

  const offY = -HALF + TOKEN_OFFSET;
  const sy = start.y + offY;
  const ey = end.y + offY;

  if (Math.abs(sy - ey) < 2) {
    return [{ x: start.x, y: sy }, { x: end.x, y: ey }];
  }

  // Add intermediate points along the curve so tokens follow the bend
  const midX = snapToCellCenter((start.x + end.x) / 2);
  const r = 12;
  const dy = ey > sy ? 1 : -1;

  return [
    { x: start.x, y: sy },
    { x: midX - r, y: sy },
    { x: midX, y: sy + r * dy },
    { x: midX, y: ey - r * dy },
    { x: midX + r, y: ey },
    { x: end.x, y: ey },
  ];
}

function executionToWaitingPath(
  fromNode: LayoutNode,
  waitingNode: LayoutNode,
): Array<{ x: number; y: number }> {
  const startGX = fromNode.gx + fromNode.gw - 2;
  const startGY = fromNode.gy + fromNode.gh;
  const waitPx = rectToPx(waitingNode);
  const waitCenter = {
    x: waitPx.x + Math.round((waitPx.w - TOKEN_SIZE) / 2),
    y: waitPx.y + Math.round((waitPx.h - TOKEN_SIZE) / 2),
  };
  const beltY = (waitingNode.gy + Math.floor(waitingNode.gh / 2)) * CELL + TOKEN_OFFSET;

  return [
    { x: startGX * CELL + TOKEN_OFFSET, y: startGY * CELL + TOKEN_OFFSET },
    { x: startGX * CELL + TOKEN_OFFSET, y: beltY },
    { x: waitCenter.x, y: beltY },
    waitCenter,
  ];
}

function waitingToExecutionPath(
  waitingNode: LayoutNode,
  toNode: LayoutNode,
): Array<{ x: number; y: number }> {
  const waitPx = rectToPx(waitingNode);
  const waitCenter = {
    x: waitPx.x + Math.round((waitPx.w - TOKEN_SIZE) / 2),
    y: waitPx.y + Math.round((waitPx.h - TOKEN_SIZE) / 2),
  };
  const leftResumeGX = waitingNode.gx - 1;
  const leftTurnGX = toNode.gx - 2;
  const topGY = toNode.gy + 1;
  const beltY = (waitingNode.gy + Math.floor(waitingNode.gh / 2)) * CELL + TOKEN_OFFSET;

  return [
    waitCenter,
    { x: leftResumeGX * CELL + TOKEN_OFFSET, y: beltY },
    { x: leftTurnGX * CELL + TOKEN_OFFSET, y: beltY },
    { x: leftTurnGX * CELL + TOKEN_OFFSET, y: topGY * CELL + TOKEN_OFFSET },
    { x: (toNode.gx - 1) * CELL + TOKEN_OFFSET, y: topGY * CELL + TOKEN_OFFSET },
  ];
}

function pointAlongPath(
  points: Array<{ x: number; y: number }>,
  totalLength: number,
  t: number
): { x: number; y: number } {
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 };

  let targetDist = t * totalLength;
  for (let i = 1; i < points.length; i++) {
    const segLen = Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y
    );
    if (targetDist <= segLen) {
      const frac = segLen > 0 ? targetDist / segLen : 0;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * frac,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * frac,
      };
    }
    targetDist -= segLen;
  }
  return points[points.length - 1];
}

function createTokenEl(item: WorkItem): HTMLElement {
  const el = document.createElement("div");
  el.classList.add("ff-token");
  el.dataset.itemId = item.id;

  const glyph = document.createElement("span");
  glyph.classList.add("ff-token__glyph");
  el.appendChild(glyph);

  const label = document.createElement("span");
  label.classList.add("ff-token__label");
  el.appendChild(label);

  const title = document.createElement("span");
  title.classList.add("ff-token__title");
  el.appendChild(title);

  return el;
}

function updateTokenClasses(el: HTMLElement, item: WorkItem) {
  const visualKind = resolveItemVisualKind(item);
  const classes = ["ff-token", `ff-token--${item.state}`, `ff-token--${visualKind}`];

  // Outcome-based styling for completed items
  if (item.outcome === "rejected") classes.push("ff-token--outcome-rejected");
  if (item.outcome === "decomposed") classes.push("ff-token--outcome-decomposed");
  if (item.outcome === "banked") classes.push("ff-token--outcome-banked");

  // Maintainer handoff distinction
  if (item.state === "waiting") classes.push("ff-token--handoff");

  // Stalled heartbeat
  const ext = item.extensions?.openreactor as Record<string, unknown> | undefined;
  if (ext?.stalledHeartbeat) classes.push("ff-token--stalled");
  if (ext?.providerFallback) classes.push("ff-token--fallback");
  if (ext?.ciPending) classes.push("ff-token--ci-pending");
  if (ext?.lastFailureKind === "ci-failure") classes.push("ff-token--ci-failure");
  if (ext?.lastFailureKind === "merge-conflict") classes.push("ff-token--merge-conflict");

  el.className = classes.join(" ");
  el.dataset.itemId = item.id;

  const glyph = el.querySelector(".ff-token__glyph") as HTMLElement;
  if (glyph.dataset.kind !== visualKind) {
    glyph.dataset.kind = visualKind;
    glyph.innerHTML = tokenGlyphMarkup(visualKind);
  }

  const label = el.querySelector(".ff-token__label") as HTMLElement;
  label.textContent = shortLabel(item);

  // Add status icon for special states
  let iconEl = el.querySelector(".ff-token__icon") as HTMLElement | null;
  const failureKind = ext?.lastFailureKind as string | undefined;
  const isRetryingFailure = item.state === "retrying" && failureKind;
  const needsIcon = item.state === "waiting" || item.outcome === "decomposed" || item.outcome === "rejected" || item.outcome === "banked" || ext?.stalledHeartbeat || isRetryingFailure;

  if (needsIcon) {
    if (!iconEl) {
      iconEl = document.createElement("span");
      iconEl.classList.add("ff-token__icon");
      el.appendChild(iconEl);
    }
    if (isRetryingFailure && failureKind === "ci-failure") iconEl.textContent = "❌";
    else if (isRetryingFailure && failureKind === "merge-conflict") iconEl.textContent = "⇄";
    else if (item.state === "waiting") iconEl.textContent = "✋";
    else if (item.outcome === "decomposed") iconEl.textContent = "⑂";
    else if (item.outcome === "rejected") iconEl.textContent = "✕";
    else if (item.outcome === "banked") iconEl.textContent = "⏸";
    else if (ext?.stalledHeartbeat) iconEl.textContent = "⚠";
  } else {
    iconEl?.remove();
  }

  const title = el.querySelector(".ff-token__title") as HTMLElement;
  title.textContent = item.label;
}

function shortLabel(item: WorkItem): string {
  const ext = item.extensions?.openreactor as Record<string, unknown> | undefined;
  if (typeof ext?.issueNumber === "number") return compactIssueNumber(ext.issueNumber);
  const match = item.label.match(/#(\d+)/);
  if (match) return compactIssueNumber(Number(match[1]));
  return item.label.slice(0, 4);
}

function compactIssueNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (value < 100) return String(value);
  return String(value % 100).padStart(2, "0");
}

function tokenGlyphMarkup(kind: TokenVisualKind): string {
  if (kind === "pull-request") {
    return `
      <svg class="ff-token__svg ff-token__svg--pull-request" viewBox="0 0 16 16" aria-hidden="true">
        <path class="ff-token__svg-solid" d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
      </svg>
    `;
  }

  return `
    <svg class="ff-token__svg ff-token__svg--issue" viewBox="0 0 24 24" aria-hidden="true">
      <path class="ff-token__svg-body" d="M7 4.5H17C18.1046 4.5 19 5.39543 19 6.5V14.5L13.5 20H7C5.89543 20 5 19.1046 5 18V6.5C5 5.39543 5.89543 4.5 7 4.5Z" />
      <path class="ff-token__svg-accent" d="M9 2.25H15C15.8284 2.25 16.5 2.92157 16.5 3.75V6H7.5V3.75C7.5 2.92157 8.17157 2.25 9 2.25Z" />
      <path class="ff-token__svg-detail" d="M14 20V14.8H19" />
      <path class="ff-token__svg-detail" d="M8.5 10.25H15.5" />
      <path class="ff-token__svg-detail" d="M8.5 13H15" />
    </svg>
  `;
}
