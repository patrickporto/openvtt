import { describe, expect, it } from 'bun:test';
import { GridPath } from '../src/gridPath';
import { GridRenderer } from '../src/grid';

const square = { type: 'square' as const, size: 100 };
const hex = { type: 'hex-vertical' as const, size: 100 };
const iso = { type: 'isometric' as const, size: 100 };

function squareCenter(col: number, row: number) {
  return GridRenderer.cellCenterOf(col, row, 'square', 100);
}

describe('GridPath (square)', () => {
  it('measures a straight drag as a single segment', () => {
    const path = new GridPath(squareCenter(0, 0), square);
    expect(path.extend(squareCenter(3, 0))).toBe(true);
    expect(path.units).toBe(3);
    expect(path.waypointPoints).toEqual([squareCenter(0, 0), squareCenter(3, 0)]);
    expect(path.cellPoints).toEqual([
      squareCenter(0, 0),
      squareCenter(1, 0),
      squareCenter(2, 0),
      squareCenter(3, 0),
    ]);
  });

  it('accumulates L-shaped drags through the corner instead of the hypotenuse', () => {
    const path = new GridPath(squareCenter(0, 0), square);
    path.extend(squareCenter(2, 0));
    path.extend(squareCenter(2, 2));
    expect(path.units).toBe(4);
    expect(path.waypointPoints).toEqual([
      squareCenter(0, 0),
      squareCenter(2, 0),
      squareCenter(2, 2),
    ]);
    expect(path.cellPoints).toHaveLength(5);
  });

  it('commits corners on Z-shaped drags', () => {
    const path = new GridPath(squareCenter(0, 0), square);
    path.extend(squareCenter(2, 0));
    path.extend(squareCenter(2, 2));
    path.extend(squareCenter(4, 2));
    expect(path.units).toBe(6);
    expect(path.waypointPoints).toEqual([
      squareCenter(0, 0),
      squareCenter(2, 0),
      squareCenter(2, 2),
      squareCenter(4, 2),
    ]);
  });

  it('measures diagonal drags with per-cell diagonal cost', () => {
    const path = new GridPath(squareCenter(0, 0), square);
    path.extend(squareCenter(2, 2));
    expect(path.units).toBeCloseTo(2 * Math.SQRT2, 10);
    expect(path.waypointPoints).toHaveLength(2);
    expect(path.cellPoints).toEqual([
      squareCenter(0, 0),
      squareCenter(1, 1),
      squareCenter(2, 2),
    ]);
  });

  it('absorbs near-diagonal staircases into one segment', () => {
    const path = new GridPath(squareCenter(0, 0), square);
    path.extend(squareCenter(3, 2));
    expect(path.units).toBeCloseTo(Math.hypot(3, 2), 10);
    expect(path.waypointPoints).toEqual([squareCenter(0, 0), squareCenter(3, 2)]);
    expect(path.cellPoints.length).toBeGreaterThanOrEqual(5);
    expect(path.cellPoints[0]).toEqual(squareCenter(0, 0));
    expect(path.cellPoints[path.cellPoints.length - 1]).toEqual(squareCenter(3, 2));
  });

  it('retracts the live segment when dragging back', () => {
    const path = new GridPath(squareCenter(0, 0), square);
    path.extend(squareCenter(3, 0));
    path.extend(squareCenter(1, 0));
    expect(path.units).toBe(1);
    expect(path.waypointPoints).toEqual([squareCenter(0, 0), squareCenter(1, 0)]);
  });

  it('drops turns that are backtracked past', () => {
    const path = new GridPath(squareCenter(0, 0), square);
    path.extend(squareCenter(2, 0));
    path.extend(squareCenter(2, 2));
    path.extend(squareCenter(2, 0));
    expect(path.units).toBe(2);
    path.extend(squareCenter(1, 0));
    expect(path.units).toBe(1);
    expect(path.waypointPoints).toEqual([squareCenter(0, 0), squareCenter(1, 0)]);
    expect(path.cellPoints).toEqual([squareCenter(0, 0), squareCenter(1, 0)]);
  });

  it('does not accumulate path on boundary jitter', () => {
    const path = new GridPath(squareCenter(0, 0), square);
    path.extend(squareCenter(1, 0));
    path.extend(squareCenter(0, 0));
    expect(path.units).toBe(0);
    expect(path.waypointPoints).toHaveLength(1);
    path.extend(squareCenter(1, 0));
    expect(path.units).toBe(1);
    expect(path.waypointPoints).toHaveLength(2);
  });

  it('ignores extends to the current cell', () => {
    const path = new GridPath(squareCenter(0, 0), square);
    path.extend(squareCenter(2, 0));
    expect(path.extend(squareCenter(2, 0))).toBe(false);
    expect(path.units).toBe(2);
    expect(path.waypointPoints).toHaveLength(2);
  });

  it('accepts raw pointer positions and snaps them', () => {
    const path = new GridPath(squareCenter(0, 0), square);
    path.extend({ x: 340, y: 70 });
    expect(path.units).toBe(3);
    expect(path.endPoint).toEqual(squareCenter(3, 0));
  });

  it('drags into negative coordinates', () => {
    const path = new GridPath(squareCenter(0, 0), square);
    path.extend(squareCenter(-3, -2));
    expect(path.units).toBeCloseTo(Math.hypot(3, 2), 10);
    expect(path.waypointPoints).toEqual([squareCenter(0, 0), squareCenter(-3, -2)]);
    expect(path.cellPoints).toHaveLength(6);
  });

  it('honors grid offsets', () => {
    const grid = { type: 'square' as const, size: 50, offsetX: 10, offsetY: 20 };
    const origin = GridRenderer.cellCenterOf(1, 1, 'square', 50, 10, 20);
    const path = new GridPath(origin, grid);
    path.extend(GridRenderer.cellCenterOf(4, 1, 'square', 50, 10, 20));
    expect(path.units).toBe(3);
    expect(path.cellPoints).toHaveLength(4);
  });
});

describe('GridPath (hex-vertical)', () => {
  it('keeps a straight vertical drag as one segment', () => {
    const origin = GridRenderer.cellCenterOf(0, 0, 'hex-vertical', 100);
    const path = new GridPath(origin, hex);
    path.extend({ x: 10, y: 75 });
    path.extend({ x: 10, y: 150 });
    path.extend({ x: 10, y: 225 });
    expect(path.units).toBe(3);
    expect(path.waypointPoints).toHaveLength(2);
    expect(path.cellPoints).toHaveLength(4);
  });

  it('commits a turn on a direction change', () => {
    const origin = GridRenderer.cellCenterOf(0, 0, 'hex-vertical', 100);
    const path = new GridPath(origin, hex);
    path.extend({ x: 10, y: 75 });
    path.extend({ x: 10, y: 150 });
    path.extend({ x: 96, y: 150 });
    expect(path.units).toBe(3);
    expect(path.waypointPoints).toHaveLength(3);
  });

  it('retracts on backtrack', () => {
    const origin = GridRenderer.cellCenterOf(0, 0, 'hex-vertical', 100);
    const path = new GridPath(origin, hex);
    path.extend({ x: 10, y: 75 });
    path.extend({ x: 10, y: 150 });
    path.extend({ x: 10, y: 75 });
    expect(path.units).toBe(1);
    expect(path.waypointPoints).toHaveLength(2);
  });
});

describe('GridPath (hex-horizontal)', () => {
  it('keeps a straight horizontal drag as one segment', () => {
    const origin = GridRenderer.cellCenterOf(0, 0, 'hex-horizontal', 100);
    const path = new GridPath(origin, { type: 'hex-horizontal', size: 100 });
    path.extend({ x: 75, y: 10 });
    path.extend({ x: 150, y: 10 });
    path.extend({ x: 225, y: 10 });
    expect(path.units).toBe(3);
    expect(path.waypointPoints).toHaveLength(2);
    expect(path.cellPoints).toHaveLength(4);
  });
});

describe('GridPath (isometric)', () => {
  it('counts cells along an iso axis without spurious turns', () => {
    const origin = GridRenderer.cellCenterOf(0, 0, 'isometric', 100);
    const path = new GridPath(origin, iso);
    path.extend({ x: 40, y: 20 });
    path.extend({ x: 90, y: 45 });
    path.extend({ x: 140, y: 70 });
    expect(path.units).toBe(3);
    expect(path.waypointPoints).toHaveLength(2);
  });
});

describe('GridPath (validation)', () => {
  it('rejects gridless paths and non-positive sizes', () => {
    expect(() => new GridPath({ x: 0, y: 0 }, { type: 'none', size: 100 })).toThrow();
    expect(() => new GridPath({ x: 0, y: 0 }, { type: 'square', size: 0 })).toThrow();
  });
});
