import type { GridType } from './config';
import { GridRenderer, type CellIndex } from './grid';
import type { Point } from './input/types';

export interface GridPathOptions {
  type: GridType;
  size: number;
  offsetX?: number;
  offsetY?: number;
}

const SIMPLIFY_TOLERANCE = 0.72;

function sameCell(a: CellIndex, b: CellIndex): boolean {
  return a.col === b.col && a.row === b.row;
}

function delta(from: CellIndex, to: CellIndex): CellIndex {
  return { col: to.col - from.col, row: to.row - from.row };
}

function segmentUnits(seg: CellIndex, type: GridType): number {
  if (type === 'square') return Math.hypot(seg.col, seg.row);
  return Math.max(Math.abs(seg.col), Math.abs(seg.row));
}

export class GridPath {
  private readonly grid: Required<GridPathOptions>;
  private readonly cells: CellIndex[] = [];
  private waypoints: CellIndex[] = [];

  constructor(origin: Point, grid: GridPathOptions) {
    if (grid.type === 'none' || !(grid.size > 0)) {
      throw new Error('GridPath requires a grid type other than "none" and a positive size');
    }
    this.grid = { offsetX: 0, offsetY: 0, ...grid };
    const start = this.cellOf(origin);
    this.cells.push(start);
    this.waypoints = [start];
  }

  extend(target: Point): boolean {
    const snapped = GridRenderer.snapToGrid(
      target.x,
      target.y,
      this.grid.type,
      this.grid.size,
      this.grid.offsetX,
      this.grid.offsetY,
    );
    const goal = this.cellOf(snapped);
    if (sameCell(goal, this.cells[this.cells.length - 1])) return false;
    const visited = this.lastIndexInCells(goal);
    if (visited >= 0) {
      this.cells.length = visited + 1;
    } else {
      const from = this.centerOf(this.cells[this.cells.length - 1]);
      for (const cell of this.sampleCells(from, snapped)) this.cells.push(cell);
    }
    this.simplify();
    return true;
  }

  get startPoint(): Point {
    return this.centerOf(this.cells[0]);
  }

  get endPoint(): Point {
    return this.centerOf(this.cells[this.cells.length - 1]);
  }

  get waypointPoints(): Point[] {
    return this.waypoints.map((cell) => this.centerOf(cell));
  }

  get cellPoints(): Point[] {
    return this.cells.map((cell) => this.centerOf(cell));
  }

  get units(): number {
    let total = 0;
    for (let i = 1; i < this.waypoints.length; i++) {
      total += segmentUnits(delta(this.waypoints[i - 1], this.waypoints[i]), this.grid.type);
    }
    return total;
  }

  private simplify(): void {
    const cells = this.cells;
    const tolerance = SIMPLIFY_TOLERANCE * this.grid.size;
    const keep = new Set<number>([0, cells.length - 1]);
    const stack: Array<[number, number]> = [[0, cells.length - 1]];
    while (stack.length > 0) {
      const [from, to] = stack.pop()!;
      if (to <= from + 1) continue;
      const a = this.centerOf(cells[from]);
      const b = this.centerOf(cells[to]);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy) || 1;
      let best = -1;
      let bestDeviation = 0;
      for (let i = from + 1; i < to; i++) {
        const p = this.centerOf(cells[i]);
        const deviation = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / length;
        if (deviation > bestDeviation) {
          bestDeviation = deviation;
          best = i;
        }
      }
      if (best >= 0 && bestDeviation > tolerance) {
        keep.add(best);
        stack.push([from, best], [best, to]);
      }
    }
    this.waypoints = cells.filter((_, index) => keep.has(index));
  }

  private lastIndexInCells(goal: CellIndex): number {
    for (let i = this.cells.length - 1; i >= 0; i--) {
      if (sameCell(this.cells[i], goal)) return i;
    }
    return -1;
  }

  private sampleCells(from: Point, to: Point): CellIndex[] {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const stride = Math.max(1, this.grid.size / 4);
    const count = Math.max(1, Math.ceil(distance / stride));
    const cells: CellIndex[] = [];
    let last = this.cells[this.cells.length - 1];
    for (let i = 1; i <= count; i++) {
      const t = i / count;
      const cell = this.cellOf({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      });
      if (sameCell(cell, last)) continue;
      cells.push(cell);
      last = cell;
    }
    return cells;
  }

  private cellOf(point: Point): CellIndex {
    return GridRenderer.cellIndexOf(
      point.x,
      point.y,
      this.grid.type,
      this.grid.size,
      this.grid.offsetX,
      this.grid.offsetY,
    );
  }

  private centerOf(cell: CellIndex): Point {
    return GridRenderer.cellCenterOf(
      cell.col,
      cell.row,
      this.grid.type,
      this.grid.size,
      this.grid.offsetX,
      this.grid.offsetY,
    );
  }
}
