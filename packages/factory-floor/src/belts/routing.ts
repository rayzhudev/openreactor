import type { LayoutNode } from "../types";
import { slotCenter, snapToCellCenter } from "../layout/grid";

const CELL = 25;
const HALF = 12;
const CURVE_R = 12; // radius for rounded corners
const RETURN_LOOP_RIGHT_SHIFT_CELLS = 2;
const RETURN_LOOP_DROP_CELLS = 4;

export type BeltDirection = "up" | "right" | "down" | "left";

export interface BeltCell {
  gx: number;
  gy: number;
  enter: BeltDirection;
  exit: BeltDirection;
}

export function computeBeltPath(
  from: LayoutNode,
  to: LayoutNode,
  isReturnLoop: boolean
): string {
  if (isReturnLoop) {
    return computeReturnLoopPath(from, to);
  }

  const fromBelow = from.gy + from.gh <= to.gy;
  const fromAbove = to.gy + to.gh <= from.gy;

  if (fromBelow || fromAbove) {
    return computeVerticalPath(from, to, fromBelow);
  }

  return computeHorizontalPath(from, to);
}

export function computeBeltCells(
  from: LayoutNode,
  to: LayoutNode,
  isReturnLoop: boolean,
  interruptNode?: LayoutNode | null,
): BeltCell[] {
  if (isReturnLoop) {
    return computeReturnLoopCells(from, to, interruptNode);
  }

  const fromBelow = from.gy + from.gh <= to.gy;
  const fromAbove = to.gy + to.gh <= from.gy;

  if (fromBelow || fromAbove) {
    return computeVerticalCells(from, to, fromBelow);
  }

  return computeHorizontalCells(from, to);
}

function computeHorizontalPath(from: LayoutNode, to: LayoutNode): string {
  const start = slotCenter(from, "right");
  const end = slotCenter(to, "left");

  if (Math.abs(start.y - end.y) < 2) {
    return `M ${start.x} ${start.y} H ${end.x}`;
  }

  // Route: horizontal → curve → vertical → curve → horizontal
  const midX = snapToCellCenter((start.x + end.x) / 2);
  const dy = end.y > start.y ? 1 : -1;
  const r = CURVE_R;

  return [
    `M ${start.x} ${start.y}`,
    `H ${midX - r}`,
    `Q ${midX} ${start.y} ${midX} ${start.y + r * dy}`,
    `V ${end.y - r * dy}`,
    `Q ${midX} ${end.y} ${midX + r} ${end.y}`,
    `H ${end.x}`,
  ].join(" ");
}

function computeHorizontalCells(from: LayoutNode, to: LayoutNode): BeltCell[] {
  const startSlot = slotCenter(from, "right");
  const endSlot = slotCenter(to, "left");
  const startCell = { gx: from.gx + from.gw, gy: from.gy + Math.floor(from.gh / 2) };
  const endCell = { gx: to.gx - 1, gy: to.gy + Math.floor(to.gh / 2) };

  if (startCell.gy === endCell.gy) {
    return buildCells([startCell, endCell], "right", "right");
  }

  const midX = snapToCellCenter((startSlot.x + endSlot.x) / 2);
  const cornerGX = centerPxToCell(midX);

  return buildCells(
    [
      startCell,
      { gx: cornerGX, gy: startCell.gy },
      { gx: cornerGX, gy: endCell.gy },
      endCell,
    ],
    "right",
    "right",
  );
}

function computeVerticalPath(from: LayoutNode, to: LayoutNode, goDown: boolean): string {
  const start = slotCenter(from, goDown ? "bottom" : "top");
  const end = slotCenter(to, goDown ? "top" : "bottom");

  if (Math.abs(start.x - end.x) < 2) {
    return `M ${start.x} ${start.y} V ${end.y}`;
  }

  // Route: vertical → curve → horizontal → curve → vertical
  const midY = snapToCellCenter((start.y + end.y) / 2);
  const dx = end.x > start.x ? 1 : -1;
  const dy = goDown ? 1 : -1;
  const r = CURVE_R;

  return [
    `M ${start.x} ${start.y}`,
    `V ${midY - r * dy}`,
    `Q ${start.x} ${midY} ${start.x + r * dx} ${midY}`,
    `H ${end.x - r * dx}`,
    `Q ${end.x} ${midY} ${end.x} ${midY + r * dy}`,
    `V ${end.y}`,
  ].join(" ");
}

function computeVerticalCells(from: LayoutNode, to: LayoutNode, goDown: boolean): BeltCell[] {
  const startSlot = slotCenter(from, goDown ? "bottom" : "top");
  const endSlot = slotCenter(to, goDown ? "top" : "bottom");
  const startCell = {
    gx: from.gx + Math.floor(from.gw / 2),
    gy: goDown ? from.gy + from.gh - 1 : from.gy - 1,
  };
  const endCell = {
    gx: to.gx + Math.floor(to.gw / 2),
    gy: goDown ? to.gy - 1 : to.gy + to.gh,
  };

  if (startCell.gx === endCell.gx) {
    return buildCells([startCell, endCell], goDown ? "down" : "up", goDown ? "down" : "up");
  }

  const midY = snapToCellCenter((startSlot.y + endSlot.y) / 2);
  const cornerGY = centerPxToCell(midY);
  const verticalDir: BeltDirection = goDown ? "down" : "up";
  const horizontalExit: BeltDirection = endCell.gx > startCell.gx ? "right" : "left";

  return buildCells(
    [
      startCell,
      { gx: startCell.gx, gy: cornerGY },
      { gx: endCell.gx, gy: cornerGY },
      endCell,
    ],
    verticalDir,
    verticalDir,
    horizontalExit,
  );
}

function computeReturnLoopPath(from: LayoutNode, to: LayoutNode): string {
  const startSlot = returnLoopStartSlot(from);
  const endSlot = slotCenter(to, "left");
  const loopY = snapToCellCenter(
    Math.max(startSlot.y, endSlot.y) + RETURN_LOOP_DROP_CELLS * CELL
  );
  const loopX = snapToCellCenter(endSlot.x - 2 * CELL);
  const r = CURVE_R;

  return [
    // Down from node
    `M ${startSlot.x} ${startSlot.y}`,
    `V ${loopY - r}`,
    // Curve bottom-left
    `Q ${startSlot.x} ${loopY} ${startSlot.x - r} ${loopY}`,
    // Left along bottom
    `H ${loopX + r}`,
    // Curve up-left
    `Q ${loopX} ${loopY} ${loopX} ${loopY - r}`,
    // Up to target row
    `V ${endSlot.y + r}`,
    // Curve right at target
    `Q ${loopX} ${endSlot.y} ${loopX + r} ${endSlot.y}`,
    // Right to target node
    `H ${endSlot.x}`,
  ].join(" ");
}

function computeReturnLoopCells(
  from: LayoutNode,
  to: LayoutNode,
  interruptNode?: LayoutNode | null,
): BeltCell[] {
  if (interruptNode?.kind === "human-gate") {
    return computeInterruptedReturnLoopCells(from, interruptNode);
  }

  const startSlot = returnLoopStartSlot(from);
  const endSlot = slotCenter(to, "left");
  const loopY = snapToCellCenter(
    Math.max(startSlot.y, endSlot.y) + RETURN_LOOP_DROP_CELLS * CELL
  );
  const loopX = snapToCellCenter(endSlot.x - 2 * CELL);

  const startCell = {
    gx: centerPxToCell(startSlot.x),
    gy: from.gy + from.gh - 1,
  };
  const endCell = {
    gx: to.gx - 1,
    gy: to.gy + Math.floor(to.gh / 2),
  };

  return buildCells(
    [
      startCell,
      { gx: startCell.gx, gy: centerPxToCell(loopY) },
      { gx: centerPxToCell(loopX), gy: centerPxToCell(loopY) },
      { gx: centerPxToCell(loopX), gy: endCell.gy },
      endCell,
    ],
    "down",
    "right",
  );
}

function computeInterruptedReturnLoopCells(
  from: LayoutNode,
  interruptNode: LayoutNode,
): BeltCell[] {
  const startSlot = returnLoopStartSlot(from);
  const startGX = centerPxToCell(startSlot.x);
  const startGY = from.gy + from.gh - 1;
  const bottomGY = interruptNode.gy + Math.floor(interruptNode.gh / 2);
  const interruptMinGX = interruptNode.gx;
  const interruptMaxGX = interruptNode.gx + interruptNode.gw - 1;
  const rightResumeGX = interruptMaxGX + 1;
  const leftResumeGX = interruptMinGX - 1;
  const leftTurnGX = centerPxToCell(
    snapToCellCenter(slotCenter(from, "left").x - 2 * CELL),
  );
  const topGY = from.gy + 1;
  const topResumeGX = from.gx - 1;
  const cells: BeltCell[] = [];

  for (let gy = startGY; gy <= bottomGY; gy += 1) {
    cells.push({
      gx: startGX,
      gy,
      enter: "down",
      exit: gy === bottomGY ? "left" : "down",
    });
  }

  for (let gx = startGX - 1; gx >= rightResumeGX; gx -= 1) {
    cells.push({
      gx,
      gy: bottomGY,
      enter: "left",
      exit: "left",
    });
  }

  for (let gx = leftResumeGX; gx >= leftTurnGX; gx -= 1) {
    cells.push({
      gx,
      gy: bottomGY,
      enter: "left",
      exit: gx === leftTurnGX ? "up" : "left",
    });
  }

  for (let gy = bottomGY - 1; gy >= topGY; gy -= 1) {
    cells.push({
      gx: leftTurnGX,
      gy,
      enter: "up",
      exit: gy === topGY ? "right" : "up",
    });
  }

  for (let gx = leftTurnGX + 1; gx <= topResumeGX; gx += 1) {
    cells.push({
      gx,
      gy: topGY,
      enter: "right",
      exit: "right",
    });
  }

  return cells;
}

function returnLoopStartSlot(node: LayoutNode): { x: number; y: number } {
  const base = slotCenter(node, "bottom");
  const maxX = (node.gx + node.gw - 1) * CELL + HALF;
  return {
    x: Math.min(base.x + RETURN_LOOP_RIGHT_SHIFT_CELLS * CELL, maxX),
    y: base.y,
  };
}

function buildCells(
  waypoints: Array<{ gx: number; gy: number }>,
  startDirection: BeltDirection,
  endDirection: BeltDirection,
  preferredMiddleDirection?: BeltDirection,
): BeltCell[] {
  const normalized = dedupeWaypoints(waypoints);
  const coords: Array<{ gx: number; gy: number }> = [];

  for (let index = 0; index < normalized.length - 1; index += 1) {
    const from = normalized[index];
    const to = normalized[index + 1];
    const dx = Math.sign(to.gx - from.gx);
    const dy = Math.sign(to.gy - from.gy);

    if ((dx !== 0 && dy !== 0) || (dx === 0 && dy === 0)) {
      continue;
    }

    if (index === 0) {
      coords.push(from);
    }

    let gx = from.gx;
    let gy = from.gy;
    while (gx !== to.gx || gy !== to.gy) {
      gx += dx;
      gy += dy;
      coords.push({ gx, gy });
    }
  }

  return coords.map((cell, index) => {
    const enter =
      index === 0
        ? startDirection
        : directionBetween(coords[index - 1], cell) ?? startDirection;
    const exit =
      index === coords.length - 1
        ? endDirection
        : directionBetween(cell, coords[index + 1]) ??
          preferredMiddleDirection ??
          endDirection;

    return {
      gx: cell.gx,
      gy: cell.gy,
      enter,
      exit,
    };
  });
}

function dedupeWaypoints(
  waypoints: Array<{ gx: number; gy: number }>
): Array<{ gx: number; gy: number }> {
  const deduped: Array<{ gx: number; gy: number }> = [];

  for (const point of waypoints) {
    const prev = deduped[deduped.length - 1];
    if (!prev || prev.gx !== point.gx || prev.gy !== point.gy) {
      deduped.push(point);
    }
  }

  return deduped;
}

function directionBetween(
  from: { gx: number; gy: number },
  to: { gx: number; gy: number }
): BeltDirection | null {
  if (to.gx > from.gx) return "right";
  if (to.gx < from.gx) return "left";
  if (to.gy > from.gy) return "down";
  if (to.gy < from.gy) return "up";
  return null;
}

function centerPxToCell(value: number): number {
  return Math.round((value - HALF) / CELL);
}
