import type { FloorState, WorkItem, ActorSnapshot, ServiceSnapshot, IncidentSnapshot, LayoutNode } from "../types";

export class Tooltip {
  private el: HTMLElement;
  private container: HTMLElement;
  private selectedId: string | null = null;
  private selectedType: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.el = document.createElement("div");
    this.el.classList.add("ff-tooltip");
    this.el.hidden = true;
    container.appendChild(this.el);
  }

  show(
    target: HTMLElement,
    entityType: string,
    entityId: string,
    state: FloorState
  ) {
    this.selectedId = entityId;
    this.selectedType = entityType;

    const content = buildTooltipContent(entityType, entityId, state);
    if (!content) {
      this.hide();
      return;
    }

    this.el.innerHTML = content;
    this.el.hidden = false;

    const targetRect = target.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    const tooltipRect = this.el.getBoundingClientRect();

    let left = targetRect.right - containerRect.left + 8;
    let top = targetRect.top - containerRect.top;

    if (left + tooltipRect.width > containerRect.width) {
      left = targetRect.left - containerRect.left - tooltipRect.width - 8;
    }
    if (top + tooltipRect.height > containerRect.height) {
      top = containerRect.height - tooltipRect.height - 8;
    }

    this.el.style.left = `${Math.max(0, left)}px`;
    this.el.style.top = `${Math.max(0, top)}px`;
  }

  hide() {
    this.el.hidden = true;
    this.selectedId = null;
    this.selectedType = null;
  }

  isVisible(): boolean {
    return !this.el.hidden;
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  destroy() {
    this.el.remove();
  }
}

function buildTooltipContent(type: string, id: string, state: FloorState): string | null {
  switch (type) {
    case "node": return buildNodeTooltip(id, state);
    case "item": return buildItemTooltip(id, state);
    case "actor": return buildActorTooltip(id, state);
    case "service": return buildServiceTooltip(id, state);
    case "incident": return buildIncidentTooltip(id, state);
    default: return null;
  }
}

function buildNodeTooltip(id: string, state: FloorState): string | null {
  const node = state.nodes.get(id);
  if (!node) return null;

  const items = [...state.items.values()].filter((i) => i.currentNodeId === id);
  const actors = [...state.actors.values()].filter((a) => a.currentNodeId === id);

  let html = `<div class="ff-tooltip__header">
    <strong>${esc(node.label)}</strong>
    <span class="ff-tooltip__kind">${node.kind}</span>
  </div>`;

  html += `<div class="ff-tooltip__row">Status: <span class="ff-tooltip__status ff-tooltip__status--${node.status}">${node.status}</span></div>`;

  const total = node.kind === "sink" ? items.length : (node.node.counts?.totalItems ?? items.length);
  html += `<div class="ff-tooltip__row">Items: ${total}</div>`;

  if (node.node.capacity?.maxConcurrency) {
    html += `<div class="ff-tooltip__row">Capacity: ${actors.length}/${node.node.capacity.maxConcurrency}</div>`;
  }

  if (node.kind === "sink" && items.length > 0) {
    const orderedItems = [...items].reverse();
    html += `<div class="ff-tooltip__section ff-tooltip__section--scroll">`;
    html += `<div class="ff-tooltip__row">Pile contents, newest first</div>`;
    for (const item of orderedItems) {
      html += `<div class="ff-tooltip__item">${esc(shortItemLabel(item))} — ${item.state}</div>`;
    }
    html += `</div>`;
  } else if (items.length > 0) {
    html += `<div class="ff-tooltip__section">`;
    for (const item of items.slice(0, 8)) {
      html += `<div class="ff-tooltip__item">${esc(shortItemLabel(item))} — ${item.state}</div>`;
    }
    if (total > 8) {
      html += `<div class="ff-tooltip__more">+${total - 8} more</div>`;
    }
    html += `</div>`;
  }

  return html;
}

function buildItemTooltip(id: string, state: FloorState): string | null {
  const item = state.items.get(id);
  if (!item) return null;

  let html = `<div class="ff-tooltip__header">
    <strong>${esc(shortItemLabel(item))}</strong>
    <span class="ff-tooltip__status ff-tooltip__status--${item.state}">${item.state}</span>
  </div>`;

  html += `<div class="ff-tooltip__row">${esc(item.label)}</div>`;

  if (item.currentNodeId) {
    const node = state.nodes.get(item.currentNodeId);
    html += `<div class="ff-tooltip__row">At: ${esc(node?.label ?? item.currentNodeId)}</div>`;
  }

  if (item.assignedActorId) {
    const actor = state.actors.get(item.assignedActorId);
    html += `<div class="ff-tooltip__row">Agent: ${esc(actor?.label ?? item.assignedActorId)}</div>`;
  }

  if (item.retryCount) {
    html += `<div class="ff-tooltip__row">Retries: ${item.retryCount}</div>`;
  }

  if (item.enteredStateAt) {
    html += `<div class="ff-tooltip__row">Since: ${timeAgo(item.enteredStateAt)}</div>`;
  }

  const ext = item.extensions?.openreactor as Record<string, unknown> | undefined;
  if (ext) {
    if (ext.branchName) html += `<div class="ff-tooltip__row ff-tooltip__ext">Branch: ${esc(String(ext.branchName))}</div>`;
    if (ext.prUrl) html += `<div class="ff-tooltip__row ff-tooltip__ext"><a href="${esc(String(ext.prUrl))}" target="_blank" rel="noopener">View PR</a></div>`;
    if (ext.issueUrl) html += `<div class="ff-tooltip__row ff-tooltip__ext"><a href="${esc(String(ext.issueUrl))}" target="_blank" rel="noopener">View Issue</a></div>`;
  }

  return html;
}

function buildActorTooltip(id: string, state: FloorState): string | null {
  const actor = state.actors.get(id);
  if (!actor) return null;

  let html = `<div class="ff-tooltip__header">
    <strong>${esc(actor.label)}</strong>
    <span class="ff-tooltip__status ff-tooltip__status--${actor.status}">${actor.status}</span>
  </div>`;

  if (actor.role) html += `<div class="ff-tooltip__row">Role: ${actor.role}</div>`;
  if (actor.provider) html += `<div class="ff-tooltip__row">Provider: ${actor.provider}</div>`;
  if (actor.model) html += `<div class="ff-tooltip__row">Model: ${esc(actor.model)}</div>`;

  if (actor.currentItemId) {
    const item = state.items.get(actor.currentItemId);
    html += `<div class="ff-tooltip__row">Working on: ${esc(item ? shortItemLabel(item) : actor.currentItemId)}</div>`;
  }

  if (actor.lastHeartbeatAt) {
    html += `<div class="ff-tooltip__row">Last heartbeat: ${timeAgo(actor.lastHeartbeatAt)}</div>`;
  }

  const exec = [...state.executions.values()].find((e) => e.actorId === id && e.status === "running");
  if (exec?.attempt) {
    html += `<div class="ff-tooltip__row">Attempt: ${exec.attempt}</div>`;
  }

  return html;
}

function buildServiceTooltip(id: string, state: FloorState): string | null {
  const svc = state.services.get(id);
  if (!svc) return null;

  let html = `<div class="ff-tooltip__header">
    <strong>${esc(svc.label)}</strong>
    <span class="ff-tooltip__status ff-tooltip__status--${svc.status}">${svc.status}</span>
  </div>`;

  html += `<div class="ff-tooltip__row">Active: ${svc.active ? "Yes" : "No"}</div>`;
  if (svc.restarts) html += `<div class="ff-tooltip__row">Restarts: ${svc.restarts}</div>`;
  if (svc.cooldownUntil) html += `<div class="ff-tooltip__row">Cooldown until: ${timeAgo(svc.cooldownUntil)}</div>`;

  return html;
}

function buildIncidentTooltip(id: string, state: FloorState): string | null {
  const inc = state.incidents.get(id);
  if (!inc) return null;

  let html = `<div class="ff-tooltip__header">
    <strong>${esc(inc.label)}</strong>
    <span class="ff-tooltip__severity ff-tooltip__severity--${inc.severity}">${inc.severity}</span>
  </div>`;

  html += `<div class="ff-tooltip__row">Status: ${inc.status}</div>`;
  if (inc.reason) html += `<div class="ff-tooltip__row">Reason: ${esc(inc.reason)}</div>`;
  html += `<div class="ff-tooltip__row">Started: ${timeAgo(inc.startedAt)}</div>`;

  return html;
}

function shortItemLabel(item: WorkItem): string {
  const ext = item.extensions?.openreactor as Record<string, unknown> | undefined;
  if (ext?.issueNumber) return `#${ext.issueNumber}`;
  const match = item.label.match(/#(\d+)/);
  if (match) return `#${match[1]}`;
  return item.label.slice(0, 20);
}

function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (ms < 0) return "in " + formatDuration(-ms);
  return formatDuration(ms) + " ago";
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
