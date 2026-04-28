import type { FloorConfig } from "../types";

export class Viewport {
  private panX = 0;
  private panY = 0;
  private zoom = 1;
  private isPanning = false;
  private lastPointer = { x: 0, y: 0 };
  private world: HTMLElement;
  private container: HTMLElement;
  private config: FloorConfig;

  constructor(container: HTMLElement, world: HTMLElement, config: FloorConfig) {
    this.container = container;
    this.world = world;
    this.config = config;
    this.panX = config.originX;
    this.panY = config.originY;

    if (config.panEnabled) {
      container.addEventListener("pointerdown", this.onPointerDown);
      container.addEventListener("pointermove", this.onPointerMove);
      container.addEventListener("pointerup", this.onPointerUp);
      container.addEventListener("pointerleave", this.onPointerUp);
    }

    if (config.zoomEnabled) {
      container.addEventListener("wheel", this.onWheel, { passive: false });
    }

    this.applyTransform();
  }

  private onPointerDown = (e: PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-entity-type]") || target.closest("[data-node-id]")) return;
    this.isPanning = true;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.world.classList.add("ff-world--panning");
    this.container.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.isPanning) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.panX += dx;
    this.panY += dy;
    this.applyTransform();
  };

  private onPointerUp = () => {
    this.isPanning = false;
    this.world.classList.remove("ff-world--panning");
  };

  private onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) {
      this.panX -= e.deltaX;
      this.panY -= e.deltaY;
      this.applyTransform();
      e.preventDefault();
      return;
    }

    e.preventDefault();
    const rect = this.container.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.min(
      this.config.zoomMax,
      Math.max(this.config.zoomMin, this.zoom * factor)
    );
    const ratio = newZoom / this.zoom;

    this.panX = cursorX - ratio * (cursorX - this.panX);
    this.panY = cursorY - ratio * (cursorY - this.panY);
    this.zoom = newZoom;
    this.applyTransform();
  };

  private applyTransform() {
    this.world.style.transform =
      `translate3d(${this.panX}px, ${this.panY}px, 0) scale(${this.zoom})`;
  }

  getZoom(): number {
    return this.zoom;
  }

  panTo(x: number, y: number) {
    this.panX = -x;
    this.panY = -y;
    this.applyTransform();
  }

  zoomTo(level: number) {
    this.zoom = Math.min(this.config.zoomMax, Math.max(this.config.zoomMin, level));
    this.applyTransform();
  }

  fitToContent(contentWidth: number, contentHeight: number) {
    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || contentWidth === 0 || contentHeight === 0) {
      this.zoom = 1;
      this.panX = 20;
      this.panY = 20;
      this.applyTransform();
      return;
    }
    const scaleX = rect.width / contentWidth;
    const scaleY = rect.height / contentHeight;
    this.zoom = Math.min(
      this.config.zoomMax,
      Math.max(0.5, Math.min(scaleX, scaleY) * 0.85)
    );
    this.panX = (rect.width - contentWidth * this.zoom) / 2;
    this.panY = (rect.height - contentHeight * this.zoom) / 2;
    this.applyTransform();
  }

  destroy() {
    this.container.removeEventListener("pointerdown", this.onPointerDown);
    this.container.removeEventListener("pointermove", this.onPointerMove);
    this.container.removeEventListener("pointerup", this.onPointerUp);
    this.container.removeEventListener("pointerleave", this.onPointerUp);
    this.container.removeEventListener("wheel", this.onWheel);
  }
}
