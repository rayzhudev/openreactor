import type { FloorState, LayoutEdge } from "../types";
import {
  computeBeltCells,
  type BeltDirection,
} from "./routing";

const CELL = 25;
const TILE_SIZE = CELL;
const QUARTER_TURN_KAPPA = 0.5522847498;
const MOTION_SPEED_PX_PER_MS = CELL / 760;

type BeltVisualKind = "straight" | "corner-right" | "corner-left";
type BeltSide = "top" | "right" | "bottom" | "left";
type StraightAxis = "horizontal" | "vertical";

interface CellContribution {
  enter: BeltDirection;
  exit: BeltDirection;
  isActive: boolean;
  status: LayoutEdge["status"];
  edgeKind: LayoutEdge["kind"];
}

interface ResolvedCell {
  gx: number;
  gy: number;
  enter: BeltDirection;
  exit: BeltDirection;
  incomingSide: BeltSide;
  outgoingSide: BeltSide;
  visualKind: BeltVisualKind;
  isActive: boolean;
  isDegraded: boolean;
}

interface RenderedCell {
  host: HTMLDivElement;
  motionArrow: SVGPolygonElement;
  motionPath: SVGPathElement;
  motionLength: number;
  signature: string;
}

export class BeltLayer {
  private cellLayer: HTMLDivElement;
  private cells = new Map<string, RenderedCell>();
  private animFrame: number | null = null;
  private animStart = 0;
  private reducedMotionQuery: MediaQueryList | null = null;
  private onReducedMotionChange = () => {
    this.syncMotionPreference();
    this.layoutMotion(
      distanceForTime(this.animStart, this.reducedMotionQuery?.matches ?? false),
    );
  };

  constructor(parent: HTMLElement) {
    this.cellLayer = document.createElement("div");
    this.cellLayer.classList.add("ff-belts");
    this.cellLayer.style.position = "absolute";
    this.cellLayer.style.inset = "0";
    this.cellLayer.style.pointerEvents = "none";
    parent.appendChild(this.cellLayer);

    if (typeof window !== "undefined" && "matchMedia" in window) {
      this.reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      this.reducedMotionQuery.addEventListener("change", this.onReducedMotionChange);
    }

    this.animStart = performance.now();
    this.syncMotionPreference();
  }

  update(state: FloorState) {
    const resolvedCells = resolveNetworkCells(state);
    const activeKeys = new Set<string>();

    for (const cell of resolvedCells) {
      const key = cellKey(cell.gx, cell.gy);
      activeKeys.add(key);

      let rendered = this.cells.get(key);
      if (!rendered) {
        const host = document.createElement("div");
        host.classList.add("ff-belt-cell");
        this.cellLayer.appendChild(host);
        rendered = createRenderedCell(host, cell);
        this.cells.set(key, rendered);
      }

      if (rendered.signature !== cellSignature(cell)) {
        rendered.host.replaceChildren();
        rendered = createRenderedCell(rendered.host, cell);
        this.cells.set(key, rendered);
      }

      rendered.host.className = [
        "ff-belt-cell",
        cell.visualKind === "straight" ? "ff-belt-cell--straight" : "ff-belt-cell--corner",
      ].join(" ");
      rendered.host.classList.toggle("ff-belt-cell--active", cell.isActive);
      rendered.host.classList.toggle("ff-belt-cell--degraded", cell.isDegraded);
      rendered.host.style.width = `${TILE_SIZE}px`;
      rendered.host.style.height = `${TILE_SIZE}px`;
      rendered.host.style.left = `${cell.gx * CELL}px`;
      rendered.host.style.top = `${cell.gy * CELL}px`;
      rendered.host.style.transform = "";
    }

    for (const [key, rendered] of this.cells) {
      if (!activeKeys.has(key)) {
        rendered.host.remove();
        this.cells.delete(key);
      }
    }

    this.layoutMotion(
      distanceForTime(performance.now() - this.animStart, this.reducedMotionQuery?.matches ?? false),
    );
  }

  destroy() {
    if (this.animFrame !== null) cancelAnimationFrame(this.animFrame);
    this.reducedMotionQuery?.removeEventListener("change", this.onReducedMotionChange);
    this.cellLayer.remove();
  }

  private layoutMotion(baseDistance: number) {
    for (const rendered of this.cells.values()) {
      const distance = this.reducedMotionQuery?.matches
        ? rendered.motionLength * 0.5
        : positiveModulo(baseDistance, rendered.motionLength);
      positionMotionArrow(rendered.motionPath, rendered.motionLength, rendered.motionArrow, distance);
    }
  }

  private syncMotionPreference() {
    const reducedMotion = this.reducedMotionQuery?.matches ?? false;

    if (reducedMotion) {
      if (this.animFrame !== null) {
        cancelAnimationFrame(this.animFrame);
        this.animFrame = null;
      }
      return;
    }

    if (this.animFrame === null) {
      this.animFrame = requestAnimationFrame(this.tickMotion);
    }
  }

  private tickMotion = () => {
    this.animFrame = null;
    this.layoutMotion(distanceForTime(performance.now() - this.animStart, false));

    if (!(this.reducedMotionQuery?.matches ?? false)) {
      this.animFrame = requestAnimationFrame(this.tickMotion);
    }
  };
}

function resolveNetworkCells(state: FloorState): ResolvedCell[] {
  const contributions = new Map<string, CellContribution[]>();

  for (const edge of state.edges.values()) {
    const from = state.nodes.get(edge.from);
    const to = state.nodes.get(edge.to);
    if (!from || !to) continue;
    if (!isRenderableBelt(edge.kind)) continue;
    if (from.kind === "human-gate" || to.kind === "human-gate") continue;
    if (to.kind === "source") continue;

    const hasReverseEdge = [...state.edges.values()].some(
      (candidate) =>
        candidate.kind === "retry" &&
        candidate.from === edge.to &&
        candidate.to === edge.from,
    );
    const isReturnLoop =
      edge.kind === "retry" && hasReverseEdge && from.gy >= to.gy;
    const interruptNode = isReturnLoop ? findReturnLoopInterruptNode(state, from) : null;
    const cells = computeBeltCells(from, to, isReturnLoop, interruptNode);
    const isActive = isBeltActive(edge, state);

    for (const cell of cells) {
      const key = cellKey(cell.gx, cell.gy);
      const bucket = contributions.get(key) ?? [];
      bucket.push({
        enter: cell.enter,
        exit: cell.exit,
        isActive,
        status: edge.status,
        edgeKind: edge.kind,
      });
      contributions.set(key, bucket);
    }
  }

  return [...contributions.entries()]
    .map(([key, bucket]) => resolveCell(key, bucket))
    .sort((a, b) => (a.gy - b.gy) || (a.gx - b.gx));
}

function findReturnLoopInterruptNode(
  state: FloorState,
  processor: FloorState["nodes"] extends Map<string, infer T> ? T : never,
) {
  return [...state.nodes.values()].find(
    (node) =>
      node.kind === "human-gate" &&
      node.gx >= processor.gx &&
      node.gx + node.gw <= processor.gx + processor.gw &&
      node.gy > processor.gy,
  ) ?? null;
}

function resolveCell(key: string, bucket: CellContribution[]): ResolvedCell {
  const [gx, gy] = key.split(":").map(Number);
  const chosen = chooseContribution(bucket);

  return {
    gx,
    gy,
    enter: chosen.enter,
    exit: chosen.exit,
    incomingSide: incomingSideFor(chosen.enter),
    outgoingSide: outgoingSideFor(chosen.exit),
    visualKind: visualKindFor(chosen.enter, chosen.exit),
    isActive: bucket.some((entry) => entry.isActive),
    isDegraded: bucket.some((entry) => entry.status === "degraded" || entry.status === "down"),
  };
}

function chooseContribution(bucket: CellContribution[]): CellContribution {
  const straight = bucket
    .filter((entry) => straightAxisFor(entry.enter, entry.exit) !== null)
    .sort((a, b) => contributionPriority(a) - contributionPriority(b));

  if (straight.length > 0) {
    return straight[0];
  }

  return [...bucket].sort((a, b) => contributionPriority(a) - contributionPriority(b))[0];
}

function contributionPriority(entry: CellContribution): number {
  const activityPenalty = entry.isActive ? 0 : 10;
  const kindPenalty = entry.edgeKind === "flow" ? 0 : entry.edgeKind === "handoff" ? 1 : 2;
  return activityPenalty + kindPenalty;
}

function createRenderedCell(host: HTMLDivElement, cell: ResolvedCell): RenderedCell {
  const graphic =
    cell.visualKind === "straight"
      ? createStraightCellGraphic(cell.incomingSide, cell.outgoingSide)
      : createCornerCellGraphic(cell.incomingSide, cell.outgoingSide);
  host.appendChild(graphic.svg);

  return {
    host,
    motionArrow: graphic.motionArrow,
    motionPath: graphic.motionPath,
    motionLength: graphic.motionPath.getTotalLength(),
    signature: cellSignature(cell),
  };
}

function createSvgEl(tag: string): SVGElement {
  return document.createElementNS("http://www.w3.org/2000/svg", tag);
}

function createStraightCellGraphic(
  incomingSide: BeltSide,
  outgoingSide: BeltSide,
): {
  svg: SVGSVGElement;
  motionPath: SVGPathElement;
  motionArrow: SVGPolygonElement;
} {
  const svg = createCellSvg();
  const axis = straightAxisForSides(incomingSide, outgoingSide);
  const bodyPath = axis === "horizontal" ? "M -1 12.5 H 26" : "M 12.5 -1 V 26";
  const motionPath = svgPath(straightMotionPath(incomingSide, outgoingSide), "none", 0, {
    opacity: "0",
  });
  const dividerOffset = 3.75;
  const dividerPaths =
    axis === "horizontal"
      ? [`M -1 ${12.5 - dividerOffset} H 26`, `M -1 ${12.5 + dividerOffset} H 26`]
      : [`M ${12.5 - dividerOffset} -1 V 26`, `M ${12.5 + dividerOffset} -1 V 26`];

  svg.appendChild(svgPath(bodyPath, "var(--ff-belt-shadow)", 19, {
    opacity: "0.2",
  }));
  svg.appendChild(svgPath(bodyPath, "var(--ff-belt-bed)", 17));
  svg.appendChild(svgPath(bodyPath, "var(--ff-belt-rail)", 13));
  svg.appendChild(svgPath(bodyPath, "var(--ff-belt-lane)", 9));
  for (const dividerPath of dividerPaths) {
    svg.appendChild(svgPath(dividerPath, "none", 0, {
      stroke: "var(--ff-belt-divider)",
      strokeWidth: "1",
      opacity: "0.68",
    }));
  }
  svg.appendChild(motionPath);
  const motionArrow = createMotionArrow();
  svg.appendChild(motionArrow);

  return {
    svg,
    motionPath,
    motionArrow,
  };
}

function createCornerCellGraphic(
  incomingSide: BeltSide,
  outgoingSide: BeltSide,
): {
  svg: SVGSVGElement;
  motionPath: SVGPathElement;
  motionArrow: SVGPolygonElement;
} {
  const svg = createCellSvg();
  const bodyPath = cornerCurvePath(incomingSide, outgoingSide, 12.5);
  const dividerPaths = [
    cornerCurvePath(incomingSide, outgoingSide, 8.75),
    cornerCurvePath(incomingSide, outgoingSide, 16.25),
  ];
  const motionPath = svgPath(cornerCurvePath(incomingSide, outgoingSide, 12.5), "none", 0, {
    opacity: "0",
  });

  svg.appendChild(svgPath(bodyPath, "var(--ff-belt-shadow)", 19, {
    opacity: "0.2",
    strokeLinejoin: "round",
  }));
  svg.appendChild(svgPath(bodyPath, "var(--ff-belt-bed)", 17, {
    strokeLinejoin: "round",
  }));
  svg.appendChild(svgPath(bodyPath, "var(--ff-belt-rail)", 13, {
    strokeLinejoin: "round",
  }));
  svg.appendChild(svgPath(bodyPath, "var(--ff-belt-lane)", 9, {
    strokeLinejoin: "round",
  }));
  for (const dividerPath of dividerPaths) {
    svg.appendChild(svgPath(dividerPath, "none", 0, {
      stroke: "var(--ff-belt-divider)",
      strokeWidth: "1",
      opacity: "0.7",
      strokeLinejoin: "round",
    }));
  }
  svg.appendChild(motionPath);
  const motionArrow = createMotionArrow();
  svg.appendChild(motionArrow);

  return {
    svg,
    motionPath,
    motionArrow,
  };
}

function createMotionArrow(): SVGPolygonElement {
  const arrow = createSvgEl("polygon") as SVGPolygonElement;
  arrow.setAttribute("class", "ff-belt-cell__arrow");
  arrow.setAttribute("points", "1.6,0 -4.8,-3.5 -3.1,0 -4.8,3.5");
  arrow.setAttribute("fill", "var(--ff-belt-motion)");
  arrow.setAttribute("stroke", "rgba(34, 28, 22, 0.72)");
  arrow.setAttribute("stroke-width", "0.9");
  arrow.setAttribute("stroke-linecap", "round");
  arrow.setAttribute("stroke-linejoin", "round");
  return arrow;
}

function createCellSvg(): SVGSVGElement {
  const svg = createSvgEl("svg") as SVGSVGElement;
  svg.setAttribute("viewBox", `0 0 ${CELL} ${CELL}`);
  svg.setAttribute("width", String(CELL));
  svg.setAttribute("height", String(CELL));
  svg.classList.add("ff-belt-cell__svg");
  return svg;
}

function svgPath(
  d: string,
  stroke: string,
  strokeWidth: number,
  extraAttrs?: Record<string, string>,
): SVGPathElement {
  const path = createSvgEl("path") as SVGPathElement;
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  if (strokeWidth > 0) {
    path.setAttribute("stroke", stroke);
    path.setAttribute("stroke-width", String(strokeWidth));
    path.setAttribute("stroke-linecap", "butt");
  }
  if (extraAttrs) {
    for (const [key, value] of Object.entries(extraAttrs)) {
      path.setAttribute(key, value);
    }
  }
  return path;
}

function visualKindFor(enter: BeltDirection, exit: BeltDirection): BeltVisualKind {
  if (straightAxisFor(enter, exit) !== null) {
    return "straight";
  }
  return isRightTurn(enter, exit) ? "corner-right" : "corner-left";
}

function isRightTurn(enter: BeltDirection, exit: BeltDirection): boolean {
  switch (`${enter}->${exit}`) {
    case "up->right":
    case "right->down":
    case "down->left":
    case "left->up":
      return true;
    default:
      return false;
  }
}

function isBeltActive(edge: LayoutEdge, state: FloorState): boolean {
  const hasItems = [...state.items.values()].some(
    (item) => item.currentEdgeId === edge.id,
  );
  const fromNode = state.nodes.get(edge.from);
  const nodeHasItems = fromNode && (fromNode.node.counts?.totalItems ?? 0) > 0;
  return hasItems || !!nodeHasItems;
}

function isRenderableBelt(kind: LayoutEdge["kind"]): boolean {
  return kind === "flow" || kind === "handoff" || kind === "retry";
}

function distanceForTime(elapsedMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  return elapsedMs * MOTION_SPEED_PX_PER_MS;
}

function cellKey(gx: number, gy: number): string {
  return `${gx}:${gy}`;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function positionMotionArrow(
  path: SVGPathElement,
  length: number,
  arrow: SVGPolygonElement,
  distance: number,
) {
  const clamped = positiveModulo(distance, length);
  const point = path.getPointAtLength(clamped);
  const ahead = path.getPointAtLength(Math.min(clamped + 0.6, length));
  const angle =
    (Math.atan2(ahead.y - point.y, ahead.x - point.x) * 180) / Math.PI;
  arrow.setAttribute(
    "transform",
    `translate(${point.x}, ${point.y}) rotate(${angle})`,
  );
}

function cellSignature(cell: ResolvedCell): string {
  return `${cell.visualKind}:${cell.incomingSide}->${cell.outgoingSide}`;
}

function incomingSideFor(direction: BeltDirection): BeltSide {
  switch (direction) {
    case "up":
      return "bottom";
    case "right":
      return "left";
    case "down":
      return "top";
    case "left":
      return "right";
  }
}

function outgoingSideFor(direction: BeltDirection): BeltSide {
  switch (direction) {
    case "up":
      return "top";
    case "right":
      return "right";
    case "down":
      return "bottom";
    case "left":
      return "left";
  }
}

function straightAxisFor(enter: BeltDirection, exit: BeltDirection): StraightAxis | null {
  return straightAxisForSides(incomingSideFor(enter), outgoingSideFor(exit));
}

function straightAxisForSides(
  incomingSide: BeltSide,
  outgoingSide: BeltSide,
): StraightAxis | null {
  if (
    (incomingSide === "left" && outgoingSide === "right") ||
    (incomingSide === "right" && outgoingSide === "left")
  ) {
    return "horizontal";
  }

  if (
    (incomingSide === "top" && outgoingSide === "bottom") ||
    (incomingSide === "bottom" && outgoingSide === "top")
  ) {
    return "vertical";
  }

  return null;
}

function straightMotionPath(incomingSide: BeltSide, outgoingSide: BeltSide): string {
  const start = linePointForSide(incomingSide, 0);
  const end = linePointForSide(outgoingSide, 0);
  return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
}

function cornerCurvePath(
  incomingSide: BeltSide,
  outgoingSide: BeltSide,
  radius: number,
): string {
  const corner = cornerAnchorPoint(incomingSide, outgoingSide);
  const start = cornerPointForSide(incomingSide, corner, radius);
  const end = cornerPointForSide(outgoingSide, corner, radius);
  const handle = radius * QUARTER_TURN_KAPPA;
  const startHandle = addVector(start, inwardTangentForSide(incomingSide), handle);
  const endHandle = addVector(end, oppositeVector(outwardTangentForSide(outgoingSide)), handle);
  return `M ${start.x} ${start.y} C ${startHandle.x} ${startHandle.y} ${endHandle.x} ${endHandle.y} ${end.x} ${end.y}`;
}

function linePointForSide(side: BeltSide, inset: number): { x: number; y: number } {
  switch (side) {
    case "top":
      return { x: 12.5, y: inset };
    case "right":
      return { x: 25 - inset, y: 12.5 };
    case "bottom":
      return { x: 12.5, y: 25 - inset };
    case "left":
      return { x: inset, y: 12.5 };
  }
}

function cornerAnchorPoint(
  incomingSide: BeltSide,
  outgoingSide: BeltSide,
): { x: number; y: number } {
  const touchesTop = incomingSide === "top" || outgoingSide === "top";
  const touchesRight = incomingSide === "right" || outgoingSide === "right";
  const touchesBottom = incomingSide === "bottom" || outgoingSide === "bottom";
  const touchesLeft = incomingSide === "left" || outgoingSide === "left";

  if (touchesTop && touchesLeft) return { x: 0, y: 0 };
  if (touchesTop && touchesRight) return { x: 25, y: 0 };
  if (touchesBottom && touchesRight) return { x: 25, y: 25 };
  if (touchesBottom && touchesLeft) return { x: 0, y: 25 };

  return { x: 12.5, y: 12.5 };
}

function cornerPointForSide(
  side: BeltSide,
  corner: { x: number; y: number },
  radius: number,
): { x: number; y: number } {
  switch (side) {
    case "top":
      return { x: corner.x === 0 ? radius : corner.x - radius, y: 0 };
    case "right":
      return { x: 25, y: corner.y === 0 ? radius : corner.y - radius };
    case "bottom":
      return { x: corner.x === 0 ? radius : corner.x - radius, y: 25 };
    case "left":
      return { x: 0, y: corner.y === 0 ? radius : corner.y - radius };
  }
}

function inwardTangentForSide(side: BeltSide): { x: number; y: number } {
  switch (side) {
    case "top":
      return { x: 0, y: 1 };
    case "right":
      return { x: -1, y: 0 };
    case "bottom":
      return { x: 0, y: -1 };
    case "left":
      return { x: 1, y: 0 };
  }
}

function outwardTangentForSide(side: BeltSide): { x: number; y: number } {
  switch (side) {
    case "top":
      return { x: 0, y: -1 };
    case "right":
      return { x: 1, y: 0 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
  }
}

function addVector(
  point: { x: number; y: number },
  direction: { x: number; y: number },
  distance: number,
): { x: number; y: number } {
  return {
    x: point.x + direction.x * distance,
    y: point.y + direction.y * distance,
  };
}

function oppositeVector(direction: { x: number; y: number }): { x: number; y: number } {
  return { x: -direction.x, y: -direction.y };
}
