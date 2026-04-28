import type { AutomationStatusPayload, FloorConfig, FloorState } from "./types";
import { DEFAULT_CONFIG } from "./types";
import { Viewport } from "./viewport/Viewport";
import { BeltLayer } from "./belts/BeltLayer";
import { EntityLayer } from "./entities/EntityLayer";
import { TokenLayer } from "./entities/TokenLayer";
import { Tooltip } from "./entities/Tooltip";
import { Poller } from "./data/poller";
import { mapPayloadToState } from "./data/mapper";
import { diffStates } from "./data/differ";
import styles from "./styles/base.css?inline";

export class FactoryFloorElement extends HTMLElement {
  static observedAttributes = [
    "url", "poll-interval", "width", "height",
    "pan", "zoom", "zoom-min", "zoom-max",
    "origin-x", "origin-y", "minimap",
    "grid-visible", "theme", "muted",
  ];

  private viewport: Viewport | null = null;
  private beltLayer: BeltLayer | null = null;
  private entityLayer: EntityLayer | null = null;
  private tokenLayer: TokenLayer | null = null;
  private tooltip: Tooltip | null = null;
  private poller: Poller | null = null;
  private prevState: FloorState | null = null;
  private state: FloorState | null = null;
  private config: FloorConfig = { ...DEFAULT_CONFIG };
  private shadow: ShadowRoot;
  private viewportEl!: HTMLElement;
  private worldEl!: HTMLElement;
  private floorEl!: HTMLElement;
  private hudEl!: HTMLElement;
  private bannerEl: HTMLElement | null = null;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.config = this.readConfig();
    this.buildDOM();
    this.viewport = new Viewport(this.viewportEl, this.worldEl, this.config);
    this.beltLayer = new BeltLayer(this.worldEl);
    this.entityLayer = new EntityLayer(this.worldEl);
    this.tokenLayer = new TokenLayer(this.worldEl);
    this.tooltip = new Tooltip(this.viewportEl);

    this.worldEl.addEventListener("click", this.onClick);
    this.worldEl.addEventListener("pointermove", this.onHover);
    this.worldEl.addEventListener("pointerleave", this.onPointerLeave);
    this.viewportEl.addEventListener("click", this.onViewportClick);

    const url = this.getAttribute("url");
    if (url) {
      this.startPolling(url);
    }
  }

  disconnectedCallback() {
    this.poller?.stop();
    this.viewport?.destroy();
    this.beltLayer?.destroy();
    this.entityLayer?.destroy();
    this.tokenLayer?.destroy();
    this.tooltip?.destroy();
    this.worldEl?.removeEventListener("click", this.onClick);
    this.worldEl?.removeEventListener("pointermove", this.onHover);
    this.worldEl?.removeEventListener("pointerleave", this.onPointerLeave);
    this.viewportEl?.removeEventListener("click", this.onViewportClick);
  }

  attributeChangedCallback(name: string, _old: string | null, val: string | null) {
    if (name === "url") {
      this.poller?.stop();
      if (val) this.startPolling(val);
    }
    if (name === "grid-visible") {
      this.floorEl?.classList.toggle("ff-floor--hidden", val === "false");
    }
  }

  update(payload: AutomationStatusPayload) {
    this.onData(payload);
  }

  panTo(x: number, y: number) {
    this.viewport?.panTo(x, y);
  }

  zoomTo(level: number) {
    this.viewport?.zoomTo(level);
  }

  fitToContent() {
    if (!this.state) return;
    let maxX = 0;
    let maxY = 0;
    for (const node of this.state.nodes.values()) {
      maxX = Math.max(maxX, (node.gx + node.gw) * 25);
      maxY = Math.max(maxY, (node.gy + node.gh) * 25);
    }
    this.viewport?.fitToContent(maxX + 50, maxY + 50);
  }

  destroy() {
    this.poller?.stop();
    this.viewport?.destroy();
    this.beltLayer?.destroy();
    this.entityLayer?.destroy();
    this.tokenLayer?.destroy();
    this.tooltip?.destroy();
  }

  private startPolling(url: string) {
    this.poller = new Poller(
      url,
      Number(this.getAttribute("poll-interval")) || 5000,
      (payload) => this.onData(payload),
      (msg) => this.showBanner(msg, true)
    );
    this.poller.start();
  }

  private onData(payload: AutomationStatusPayload) {
    this.hideBanner();
    this.prevState = this.state;
    this.state = mapPayloadToState(payload);

    const diff = diffStates(this.prevState, this.state);

    this.beltLayer?.update(this.state);
    this.entityLayer?.update(this.state);
    this.tokenLayer?.update(this.state);

    this.renderServicesInHUD(this.state);
    this.updateSystemOverlay(payload);

    this.dispatchEvent(new CustomEvent("floor-update", {
      detail: { generatedAt: payload.generatedAt, diff },
    }));
  }

  private onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    const nodeEl = target.closest<HTMLElement>("[data-node-id]");
    if (nodeEl && this.state) {
      e.stopPropagation();
      this.selectEntity(nodeEl, "node", nodeEl.dataset.nodeId!);
      return;
    }

    const itemEl = target.closest<HTMLElement>("[data-item-id]");
    if (itemEl && this.state) {
      e.stopPropagation();
      this.selectEntity(itemEl, "item", itemEl.dataset.itemId!);
      return;
    }

    const actorEl = target.closest<HTMLElement>("[data-actor-id]");
    if (actorEl && this.state) {
      e.stopPropagation();
      this.selectEntity(actorEl, "actor", actorEl.dataset.actorId!);
      return;
    }

    const serviceEl = target.closest<HTMLElement>("[data-service-id]");
    if (serviceEl && this.state) {
      e.stopPropagation();
      this.selectEntity(serviceEl, "service", serviceEl.dataset.serviceId!);
      return;
    }

    const incidentEl = target.closest<HTMLElement>("[data-incident-id]");
    if (incidentEl && this.state) {
      e.stopPropagation();
      this.selectEntity(incidentEl, "incident", incidentEl.dataset.incidentId!);
      return;
    }
  };

  private onViewportClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".ff-tooltip") || target.closest("[data-node-id]") || target.closest("[data-item-id]") || target.closest("[data-actor-id]") || target.closest("[data-service-id]")) return;
    this.deselectAll();
  };

  private onHover = (e: PointerEvent) => {
    const target = e.target as HTMLElement;

    const itemEl = target.closest<HTMLElement>("[data-item-id]");
    if (itemEl && this.state && !this.tooltip?.isVisible()) {
      this.tooltip?.show(itemEl, "item", itemEl.dataset.itemId!, this.state);
      this.worldEl.style.cursor = "pointer";
      return;
    }

    const actorEl = target.closest<HTMLElement>("[data-actor-id]");
    if (actorEl && this.state && !this.tooltip?.isVisible()) {
      this.tooltip?.show(actorEl, "actor", actorEl.dataset.actorId!, this.state);
      this.worldEl.style.cursor = "pointer";
      return;
    }

    const nodeEl = target.closest<HTMLElement>("[data-node-id]");
    if (nodeEl && this.state && !this.tooltip?.isVisible()) {
      this.tooltip?.show(nodeEl, "node", nodeEl.dataset.nodeId!, this.state);
      this.worldEl.style.cursor = "pointer";
      return;
    }

    if (!target.closest<HTMLElement>("[data-node-id], [data-item-id], [data-actor-id]")) {
      // Only hide hover tooltip if nothing is click-selected
      if (!this.shadow.querySelector(".ff-entity--selected")) {
        this.tooltip?.hide();
      }
      this.worldEl.style.cursor = "";
    }
  };

  private onPointerLeave = () => {
    if (!this.shadow.querySelector(".ff-entity--selected")) {
      this.tooltip?.hide();
    }
  };

  private selectEntity(el: HTMLElement, type: string, id: string) {
    this.deselectAll();
    el.classList.add("ff-entity--selected");
    this.tooltip?.show(el, type, id, this.state!);

    this.dispatchEvent(new CustomEvent("entity-click", {
      detail: { type, id, data: this.getEntityData(type, id) },
    }));
  }

  private deselectAll() {
    this.shadow.querySelectorAll(".ff-entity--selected").forEach((el) => {
      el.classList.remove("ff-entity--selected");
    });
    this.tooltip?.hide();
  }

  private getEntityData(type: string, id: string): unknown {
    if (!this.state) return null;
    switch (type) {
      case "node": return this.state.nodes.get(id)?.node;
      case "item": return this.state.items.get(id);
      case "actor": return this.state.actors.get(id);
      case "service": return this.state.services.get(id);
      case "incident": return this.state.incidents.get(id);
      default: return null;
    }
  }

  private renderServicesInHUD(state: FloorState) {
    const existing = this.hudEl.querySelectorAll(".ff-service");
    const serviceIds = new Set<string>();

    for (const [id, svc] of state.services) {
      serviceIds.add(id);
      let el = this.hudEl.querySelector<HTMLElement>(`.ff-service[data-service-id="${id}"]`);
      if (!el) {
        el = document.createElement("div");
        el.classList.add("ff-service");
        el.dataset.serviceId = id;

        const dot = document.createElement("div");
        dot.classList.add("ff-service__dot");
        el.appendChild(dot);

        const info = document.createElement("div");
        info.classList.add("ff-service__info");
        const name = document.createElement("span");
        name.classList.add("ff-service__name");
        info.appendChild(name);
        const metric = document.createElement("span");
        metric.classList.add("ff-service__metric");
        info.appendChild(metric);
        el.appendChild(info);

        this.hudEl.appendChild(el);
      }

      el.className = `ff-service ff-service--${svc.status}`;
      el.dataset.serviceId = id;
      el.querySelector(".ff-service__name")!.textContent = svc.label;
      el.querySelector(".ff-service__metric")!.textContent = svc.active ? "Active" : "Inactive";
      const dot = el.querySelector(".ff-service__dot")!;
      dot.className = `ff-service__dot ff-service__dot--${svc.status}`;
    }

    existing.forEach((el) => {
      const id = (el as HTMLElement).dataset.serviceId;
      if (id && !serviceIds.has(id)) el.remove();
    });
  }

  private updateSystemOverlay(payload: AutomationStatusPayload) {
    const hasRateLimit = payload.snapshot.incidents.some(
      (i) => i.kind === "rate-limit-cooldown" && i.status === "active"
    );
    const isSystemDegraded = payload.system.status === "degraded" || payload.system.status === "down";

    this.worldEl.classList.toggle("ff-world--rate-limited", hasRateLimit);
    this.worldEl.classList.toggle("ff-world--degraded", isSystemDegraded && !hasRateLimit);

    if (hasRateLimit) {
      this.showBanner("⚠ Rate limited — system paused", false);
    } else if (isSystemDegraded) {
      // Don't show banner for normal degradation, incidents cover it
    }
  }

  private buildDOM() {
    const style = document.createElement("style");
    style.textContent = styles;
    this.shadow.appendChild(style);

    this.viewportEl = document.createElement("div");
    this.viewportEl.classList.add("ff-viewport");
    this.viewportEl.style.width = this.getAttribute("width") || "100%";
    this.viewportEl.style.height = this.getAttribute("height") || "600px";

    this.worldEl = document.createElement("div");
    this.worldEl.classList.add("ff-world");

    this.floorEl = document.createElement("div");
    this.floorEl.classList.add("ff-floor");
    if (this.getAttribute("grid-visible") === "false") {
      this.floorEl.classList.add("ff-floor--hidden");
    }
    this.worldEl.appendChild(this.floorEl);

    this.viewportEl.appendChild(this.worldEl);

    this.hudEl = document.createElement("div");
    this.hudEl.classList.add("ff-hud");
    this.viewportEl.appendChild(this.hudEl);

    this.shadow.appendChild(this.viewportEl);
  }

  private showBanner(message: string, isError: boolean) {
    if (!this.bannerEl) {
      this.bannerEl = document.createElement("div");
      this.bannerEl.classList.add("ff-hud__status-banner");
      this.hudEl.appendChild(this.bannerEl);
    }
    this.bannerEl.textContent = message;
    this.bannerEl.classList.toggle("ff-hud__status-banner--error", isError);
  }

  private hideBanner() {
    this.bannerEl?.remove();
    this.bannerEl = null;
  }

  private readConfig(): FloorConfig {
    return {
      cellSize: 25,
      panEnabled: this.getAttribute("pan") !== "false",
      zoomEnabled: this.getAttribute("zoom") !== "false",
      zoomMin: Number(this.getAttribute("zoom-min")) || 0.25,
      zoomMax: Number(this.getAttribute("zoom-max")) || 4,
      originX: Number(this.getAttribute("origin-x")) || 0,
      originY: Number(this.getAttribute("origin-y")) || 0,
      gridVisible: this.getAttribute("grid-visible") !== "false",
      muted: this.getAttribute("muted") !== "false",
    };
  }
}
