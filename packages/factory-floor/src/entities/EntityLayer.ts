import type {
  FloorState,
  LayoutNode,
  ActorSnapshot,
  IncidentSnapshot,
  NodeKind,
} from "../types";
import { rectToPx } from "../layout/grid";
import {
  resolveActorSpriteSet,
  resolveNodeSpriteUrl,
  resolveWatchdogSpriteUrl,
} from "../assets/sprite-theme";

const CELL = 25;

export class EntityLayer {
  private container: HTMLElement;
  private nodeEls = new Map<string, HTMLElement>();
  private actorEls = new Map<string, HTMLElement>();
  private watchdogEl: HTMLElement | null = null;
  private watchMarkers = new Map<string, HTMLElement>();
  private watchdogRestX = 0;
  private watchdogRestY = 0;
  private watchdogTargetNodeId: string | null = null;

  constructor(parent: HTMLElement) {
    this.container = document.createElement("div");
    this.container.classList.add("ff-entities");
    this.container.style.position = "absolute";
    this.container.style.inset = "0";
    parent.appendChild(this.container);
  }

  update(state: FloorState) {
    this.renderNodes(state);
    this.renderActors(state);
    this.renderWatchdog(state);
    this.applyWatchMarkers(state);
    this.applyIncidents(state);
  }

  private renderNodes(state: FloorState) {
    const activeIds = new Set<string>();

    const retryNodeIds = getRetryNodeIds(state);

    for (const [id, node] of state.nodes) {
      if (node.kind === "supervisor") continue;
      if (node.kind === "queue") continue;
      if (retryNodeIds.has(id)) continue;
      activeIds.add(id);
      let el = this.nodeEls.get(id);

      if (!el) {
        el = createNodeElement(node);
        this.container.appendChild(el);
        this.nodeEls.set(id, el);
      }

      updateNodeElement(el, node, state);
    }

    for (const [id, el] of this.nodeEls) {
      if (!activeIds.has(id)) {
        el.remove();
        this.nodeEls.delete(id);
      }
    }
  }

  private renderActors(state: FloorState) {
    const activeIds = new Set<string>();

    for (const [id, actor] of state.actors) {
      activeIds.add(id);
      let el = this.actorEls.get(id);

      if (!el) {
        el = createActorElement(actor);
        this.container.appendChild(el);
        this.actorEls.set(id, el);
      }

      updateActorElement(el, actor, state);
    }

    for (const [id, el] of this.actorEls) {
      if (!activeIds.has(id)) {
        el.remove();
        this.actorEls.delete(id);
      }
    }
  }

  private renderWatchdog(state: FloorState) {
    const supervisorNode = [...state.nodes.values()].find((n) => n.kind === "supervisor");
    if (!supervisorNode) {
      this.watchdogEl?.remove();
      this.watchdogEl = null;
      return;
    }

    if (!this.watchdogEl) {
      this.watchdogEl = createWatchdogElement();
      this.container.appendChild(this.watchdogEl);
    }

    const watchdogService = [...state.services.values()].find(
      (s) => s.id === "watchdog" || s.label.toLowerCase().includes("watchdog")
    );
    const isHealthy = watchdogService ? watchdogService.status === "healthy" : supervisorNode.status === "healthy";
    const isDown = watchdogService ? (watchdogService.status === "down" || !watchdogService.active) : supervisorNode.status === "down";

    this.watchdogEl.classList.toggle("ff-watchdog--healthy", isHealthy && !this.watchdogTargetNodeId);
    this.watchdogEl.classList.toggle("ff-watchdog--degraded", !isHealthy && !isDown);
    this.watchdogEl.classList.toggle("ff-watchdog--down", isDown);

    // Compute resting position: below-right of monitored area
    const monitoredNodeIds = getMonitoredNodeIds(state);
    let maxX = 0;
    let maxY = 0;
    for (const nodeId of monitoredNodeIds) {
      const node = state.nodes.get(nodeId);
      if (node) {
        const px = rectToPx(node);
        maxX = Math.max(maxX, px.x + px.w);
        maxY = Math.max(maxY, px.y + px.h);
      }
    }
    if (maxX === 0) {
      const px = rectToPx(supervisorNode);
      maxX = px.x;
      maxY = px.y;
    }
    this.watchdogRestX = maxX + CELL * 6;
    this.watchdogRestY = maxY + CELL * 3;

    // Check for active incidents on monitored nodes
    const incidentNodeId = findIncidentTarget(state, monitoredNodeIds);

    if (incidentNodeId && !isDown) {
      const targetNode = state.nodes.get(incidentNodeId);
      if (targetNode) {
        const targetPx = rectToPx(targetNode);
        // Move to the right side of the affected node
        const targetX = targetPx.x + targetPx.w + 2;
        const targetY = targetPx.y;

        if (this.watchdogTargetNodeId !== incidentNodeId) {
          this.watchdogTargetNodeId = incidentNodeId;
          this.watchdogEl.classList.add("ff-watchdog--responding");
        }

        this.watchdogEl.classList.add("ff-watchdog--spraying");
        const sprite = this.watchdogEl.querySelector(".ff-watchdog__sprite") as HTMLImageElement | null;
        if (sprite) sprite.src = resolveWatchdogSpriteUrl(true);
        this.watchdogEl.style.transform = `translate(${targetX}px, ${targetY}px)`;
      }
    } else {
      // Return to resting position
      if (this.watchdogTargetNodeId) {
        this.watchdogTargetNodeId = null;
        this.watchdogEl.classList.remove("ff-watchdog--responding");
      }
      this.watchdogEl.classList.remove("ff-watchdog--spraying");
      const sprite = this.watchdogEl.querySelector(".ff-watchdog__sprite") as HTMLImageElement | null;
      if (sprite) sprite.src = resolveWatchdogSpriteUrl(false);
      this.watchdogEl.style.transform = `translate(${this.watchdogRestX}px, ${this.watchdogRestY}px)`;
    }
  }

  private applyWatchMarkers(state: FloorState) {
    const monitoredIds = getMonitoredNodeIds(state);
    const watchdogService = [...state.services.values()].find(
      (s) => s.id === "watchdog" || s.label.toLowerCase().includes("watchdog")
    );
    const isDown = watchdogService ? (watchdogService.status === "down" || !watchdogService.active) : false;
    const activeMarkerIds = new Set<string>();

    for (const nodeId of monitoredIds) {
      activeMarkerIds.add(nodeId);
      const nodeEl = this.nodeEls.get(nodeId);
      if (!nodeEl) continue;

      let marker = this.watchMarkers.get(nodeId);
      if (!marker) {
        marker = document.createElement("div");
        marker.classList.add("ff-watch-marker");
        marker.innerHTML = `<svg viewBox="0 0 24 16" width="16" height="11"><path d="M12 2C6 2 1.5 8 1.5 8s4.5 6 10.5 6 10.5-6 10.5-6S18 2 12 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
        nodeEl.appendChild(marker);
        this.watchMarkers.set(nodeId, marker);
      }

      marker.classList.toggle("ff-watch-marker--down", isDown);
    }

    for (const [id, marker] of this.watchMarkers) {
      if (!activeMarkerIds.has(id)) {
        marker.remove();
        this.watchMarkers.delete(id);
      }
    }
  }

  private applyIncidents(state: FloorState) {
    for (const el of this.nodeEls.values()) {
      el.classList.remove("ff-incident--info", "ff-incident--warning", "ff-incident--error", "ff-incident--critical");
      el.querySelector(".ff-incident-badge")?.remove();
    }

    for (const incident of state.incidents.values()) {
      if (incident.status === "resolved") continue;
      for (const nodeId of incident.scope.nodeIds ?? []) {
        const el = this.nodeEls.get(nodeId);
        if (el) {
          el.classList.add(`ff-incident--${incident.severity}`);
          appendIncidentBadge(el, incident);
        }
      }
    }
  }

  destroy() {
    this.container.remove();
  }
}

function getRetryNodeIds(state: FloorState): Set<string> {
  const ids = new Set<string>();
  for (const [id, node] of state.nodes) {
    const hasNonRetryEdge = [...state.edges.values()].some(
      (e) => (e.from === id || e.to === id) && e.kind !== "retry"
    );
    const hasRetryEdge = [...state.edges.values()].some(
      (e) => (e.from === id || e.to === id) && e.kind === "retry"
    );
    if (!hasNonRetryEdge && hasRetryEdge) ids.add(id);
  }
  return ids;
}

function getMonitoredNodeIds(state: FloorState): Set<string> {
  const ids = new Set<string>();

  // Nodes connected via control, handoff, or retry edges from/to supervisor
  for (const edge of state.edges.values()) {
    if (edge.kind === "control") {
      const fromNode = state.nodes.get(edge.from);
      if (fromNode?.kind === "supervisor") {
        ids.add(edge.to);
        // Also add the processor that feeds the controlled node
        for (const e2 of state.edges.values()) {
          if ((e2.kind === "handoff" || e2.kind === "retry") && e2.to === edge.to) {
            ids.add(e2.from);
          }
        }
      }
    }
  }

  // Add processor nodes that have retry edges (watchdog monitors execution)
  for (const edge of state.edges.values()) {
    if (edge.kind === "retry") {
      const fromNode = state.nodes.get(edge.from);
      if (fromNode?.kind === "processor") ids.add(edge.from);
    }
  }

  return ids;
}

function findIncidentTarget(state: FloorState, monitoredNodeIds: Set<string>): string | null {
  let best: { nodeId: string; severity: number } | null = null;
  const severityOrder: Record<string, number> = { critical: 4, error: 3, warning: 2, info: 1 };

  for (const incident of state.incidents.values()) {
    if (incident.status === "resolved") continue;
    const sev = severityOrder[incident.severity] ?? 0;
    for (const nodeId of incident.scope.nodeIds ?? []) {
      // Resolve hidden nodes (blocked, retry) to visible processor nodes
      let targetId = nodeId;
      const node = state.nodes.get(nodeId);
      if (node && (node.kind === "queue")) {
        for (const edge of state.edges.values()) {
          if ((edge.kind === "handoff" || edge.kind === "retry") && edge.to === nodeId) {
            const fromNode = state.nodes.get(edge.from);
            if (fromNode?.kind === "processor") { targetId = edge.from; break; }
          }
        }
      }

      if (monitoredNodeIds.has(targetId) && (!best || sev > best.severity)) {
        best = { nodeId: targetId, severity: sev };
      }
    }
  }
  return best?.nodeId ?? null;
}

function createWatchdogElement(): HTMLElement {
  const el = document.createElement("div");
  el.classList.add("ff-watchdog");
  el.dataset.nodeKind = "supervisor";

  el.innerHTML = `
    <div class="ff-watchdog__robot">
      <img class="ff-watchdog__sprite" src="${resolveWatchdogSpriteUrl(false)}" alt="" draggable="false" />
      <div class="ff-watchdog__status"></div>
      <div class="ff-watchdog__spray">
        <div class="ff-watchdog__spray-particle"></div>
        <div class="ff-watchdog__spray-particle"></div>
        <div class="ff-watchdog__spray-particle"></div>
        <div class="ff-watchdog__spray-particle"></div>
        <div class="ff-watchdog__spray-particle"></div>
      </div>
    </div>
    <div class="ff-watchdog__label">Watchdog</div>
  `;

  return el;
}

function createNodeElement(node: LayoutNode): HTMLElement {
  const el = document.createElement("div");
  el.classList.add("ff-entity", "ff-node", `ff-node--${node.kind}`);
  el.dataset.nodeId = node.id;
  el.dataset.nodeKind = node.kind;

  const body = document.createElement("div");
  body.classList.add("ff-node__body");
  const spriteUrl = resolveNodeSpriteUrl(node);

  if (spriteUrl) {
    el.classList.add("ff-node--sprite");
    body.classList.add("ff-node__body--sprite");

    const sprite = document.createElement("img");
    sprite.classList.add("ff-node__sprite");
    sprite.src = spriteUrl;
    sprite.alt = "";
    sprite.draggable = false;
    body.appendChild(sprite);
  } else if (node.kind === "processor") {
    // Processor nodes get seat outlines instead of a single icon
    const seatCount = node.node.capacity?.maxConcurrency ?? 3;
    const tray = document.createElement("div");
    tray.classList.add("ff-node__seats");
    for (let i = 0; i < seatCount; i++) {
      const seat = document.createElement("div");
      seat.classList.add("ff-node__seat");
      tray.appendChild(seat);
    }
    body.appendChild(tray);
  } else if (node.kind !== "human-gate") {
    const icon = document.createElement("div");
    icon.classList.add("ff-node__icon");
    icon.textContent = nodeKindIcon(node.kind);
    body.appendChild(icon);
  }

  const label = document.createElement("span");
  label.classList.add("ff-node__label");
  label.textContent = node.label;
  body.appendChild(label);

  el.appendChild(body);

  const badge = document.createElement("div");
  badge.classList.add("ff-entity__badge");
  el.appendChild(badge);

  return el;
}

function updateNodeElement(el: HTMLElement, node: LayoutNode, state: FloorState) {
  const px = rectToPx(node);
  el.style.transform = `translate(${px.x}px, ${px.y}px)`;
  el.style.width = `${px.w}px`;
  el.style.height = `${px.h}px`;

  const count = node.node.counts?.totalItems ?? 0;
  el.classList.toggle("ff-node--active", node.status === "healthy" && count > 0);
  el.classList.toggle("ff-node--degraded", node.status === "degraded");
  el.classList.toggle("ff-node--down", node.status === "down");
  el.classList.toggle("ff-node--idle", node.status === "healthy" && count === 0);

  const badge = el.querySelector(".ff-entity__badge") as HTMLElement;
  if (badge) {
    badge.textContent = count > 0 ? String(count) : "";
    badge.style.display = count > 0 ? "" : "none";
  }

  el.querySelector(".ff-node__label")!.textContent = node.label;
}

function createActorElement(actor: ActorSnapshot): HTMLElement {
  const el = document.createElement("div");
  el.classList.add("ff-drone");
  el.dataset.actorId = actor.id;

  const sprites = resolveActorSpriteSet(actor);
  el.innerHTML = `
    <div class="ff-drone__unit">
      <div class="ff-drone__sprite-stack">
        <img class="ff-drone__sprite ff-drone__sprite--base" src="${sprites.base}" alt="" draggable="false" />
        <img class="ff-drone__sprite ff-drone__sprite--rotor-left" src="${sprites.rotorLeft}" alt="" draggable="false" />
        <img class="ff-drone__sprite ff-drone__sprite--rotor-right" src="${sprites.rotorRight}" alt="" draggable="false" />
        <img class="ff-drone__sprite ff-drone__sprite--provider" src="${sprites.providerOverlay ?? ""}" alt="" draggable="false" />
        <img class="ff-drone__sprite ff-drone__sprite--role" src="${sprites.roleOverlay ?? ""}" alt="" draggable="false" />
      </div>
      <div class="ff-drone__shadow"></div>
    </div>
    <div class="ff-drone__label"></div>
  `;

  return el;
}

function updateActorElement(el: HTMLElement, actor: ActorSnapshot, state: FloorState) {
  el.className = `ff-drone ff-drone--${actor.status}`;
  if (actor.role) el.classList.add(`ff-drone--role-${actor.role}`);

  const ext = actor.extensions?.openreactor as Record<string, unknown> | undefined;
  if (ext?.providerFallback) el.classList.add("ff-drone--fallback");

  el.dataset.actorId = actor.id;
  el.dataset.provider = actor.provider ?? "";

  const sprites = resolveActorSpriteSet(actor);
  setSpriteSrc(el, ".ff-drone__sprite--base", sprites.base);
  setSpriteSrc(el, ".ff-drone__sprite--rotor-left", sprites.rotorLeft);
  setSpriteSrc(el, ".ff-drone__sprite--rotor-right", sprites.rotorRight);
  setSpriteSrc(el, ".ff-drone__sprite--provider", sprites.providerOverlay);
  setSpriteSrc(el, ".ff-drone__sprite--role", sprites.roleOverlay);

  const labelEl = el.querySelector(".ff-drone__label") as HTMLElement;
  labelEl.textContent = actor.provider ?? actor.label;

  if (actor.currentNodeId) {
    const node = state.nodes.get(actor.currentNodeId);
    if (node) {
      const seat = actorSeatPosition(actor, node, state);
      el.style.transform = `translate(${seat.x}px, ${seat.y}px)`;
    }
  }
}

function actorSeatPosition(
  actor: ActorSnapshot,
  node: LayoutNode,
  state: FloorState
): { x: number; y: number } {
  const px = rectToPx(node);
  const seatCount = node.node.capacity?.maxConcurrency ?? 3;
  const workingActors = [...state.actors.values()].filter(
    (a) => a.currentNodeId === node.id
  );
  const idx = workingActors.indexOf(actor);
  const seatIdx = Math.max(0, idx);

  // Seats are evenly spaced inside the node width
  const seatW = CELL * 2;
  const totalSeatsW = seatCount * seatW;
  const startX = px.x + (px.w - totalSeatsW) / 2;

  return {
    x: startX + seatIdx * seatW,
    y: px.y - CELL,
  };
}

function appendIncidentBadge(el: HTMLElement, incident: IncidentSnapshot) {
  if (el.querySelector(`.ff-incident-badge[data-incident-id="${incident.id}"]`)) return;
  const badge = document.createElement("div");
  badge.classList.add("ff-incident-badge", `ff-incident-badge--${incident.severity}`);
  badge.dataset.incidentId = incident.id;
  badge.textContent = `⚠ ${incident.label}`;
  el.appendChild(badge);
}

function setSpriteSrc(el: HTMLElement, selector: string, src: string | null) {
  const sprite = el.querySelector(selector) as HTMLImageElement | null;
  if (!sprite) return;

  if (src) {
    sprite.src = src;
    sprite.style.display = "";
    return;
  }

  sprite.removeAttribute("src");
  sprite.style.display = "none";
}

function nodeKindIcon(kind: NodeKind): string {
  switch (kind) {
    case "source": return "▸";
    case "processor": return "⚙";
    case "queue": return "☰";
    case "router": return "⑂";
    case "sink": return "✓";
    case "supervisor": return "🔧";
    case "human-gate": return "✋";
    case "store": return "▪";
    case "scheduler": return "⏱";
    case "integration": return "⇄";
    default: return "●";
  }
}
