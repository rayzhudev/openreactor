import type { GridPos, GridRect } from "../types";

const CELL = 25;
const HALF = 12; // integer approximation of cell center offset

export function cellToPx(gx: number, gy: number): { x: number; y: number } {
  return { x: gx * CELL, y: gy * CELL };
}

export function pxToCell(x: number, y: number): GridPos {
  return { gx: Math.round(x / CELL), gy: Math.round(y / CELL) };
}

export function rectToPx(r: GridRect): { x: number; y: number; w: number; h: number } {
  return { x: r.gx * CELL, y: r.gy * CELL, w: r.gw * CELL, h: r.gh * CELL };
}

/**
 * Returns the center of the middle cell on the given side of a grid rect.
 * For a 3-wide node at gx=4, "right" returns the center of cell (gx+3, gy+1)
 * — i.e. one cell past the right edge, vertically centered.
 */
export function slotCenter(
  r: GridRect,
  side: "left" | "right" | "top" | "bottom"
): { x: number; y: number } {
  const midCellY = r.gy + Math.floor(r.gh / 2);
  const midCellX = r.gx + Math.floor(r.gw / 2);

  switch (side) {
    case "left":
      return { x: r.gx * CELL, y: midCellY * CELL + HALF };
    case "right":
      return { x: (r.gx + r.gw) * CELL, y: midCellY * CELL + HALF };
    case "top":
      return { x: midCellX * CELL + HALF, y: r.gy * CELL };
    case "bottom":
      return { x: midCellX * CELL + HALF, y: (r.gy + r.gh) * CELL };
  }
}

/** Snap a pixel value to the nearest cell center */
export function snapToCellCenter(v: number): number {
  return Math.round((v - HALF) / CELL) * CELL + HALF;
}
