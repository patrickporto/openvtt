import { describe, expect, it } from 'bun:test';
import { Graphics } from 'pixi.js';
import { GridRenderer } from '../src/grid';

describe('GridRenderer.snapToGrid', () => {
  it('returns the same point for "none"', () => {
    const snapped = GridRenderer.snapToGrid(123, 456, 'none', 50);
    expect(snapped).toEqual({ x: 123, y: 456 });
  });

  it('snaps to square cell centers', () => {
    expect(GridRenderer.snapToGrid(12, 12, 'square', 50)).toEqual({ x: 25, y: 25 });
    expect(GridRenderer.snapToGrid(60, 60, 'square', 50)).toEqual({ x: 75, y: 75 });
    expect(GridRenderer.snapToGrid(200, 200, 'square', 50)).toEqual({ x: 225, y: 225 });
  });

  it('honors square offsets', () => {
    expect(GridRenderer.snapToGrid(12, 12, 'square', 50, 10, 10)).toEqual({ x: 35, y: 35 });
  });

  it('snaps hex-vertical deterministically to a grid point', () => {
    const snapped = GridRenderer.snapToGrid(100, 100, 'hex-vertical', 50);
    const again = GridRenderer.snapToGrid(snapped.x + 5, snapped.y + 5, 'hex-vertical', 50);
    expect(again).toEqual(snapped);
  });

  it('is idempotent for isometric', () => {
    const snapped = GridRenderer.snapToGrid(137, 91, 'isometric', 50);
    const reSnapped = GridRenderer.snapToGrid(snapped.x, snapped.y, 'isometric', 50);
    expect(reSnapped).toEqual(snapped);
  });
});

describe('GridRenderer.cellIndexOf / cellCenterOf', () => {
  it('round-trips snap centers for every grid type', () => {
    for (const type of ['square', 'hex-vertical', 'hex-horizontal', 'isometric'] as const) {
      const snapped = GridRenderer.snapToGrid(137, 91, type, 50, 7, 11);
      const cell = GridRenderer.cellIndexOf(snapped.x, snapped.y, type, 50, 7, 11);
      expect(GridRenderer.cellCenterOf(cell.col, cell.row, type, 50, 7, 11)).toEqual(snapped);
    }
  });

  it('indexes square cells by containment', () => {
    expect(GridRenderer.cellIndexOf(0, 0, 'square', 50)).toEqual({ col: 0, row: 0 });
    expect(GridRenderer.cellIndexOf(50, 50, 'square', 50)).toEqual({ col: 1, row: 1 });
    expect(GridRenderer.cellIndexOf(49, 99, 'square', 50)).toEqual({ col: 0, row: 1 });
  });

  it('indexes square cells with offsets', () => {
    expect(GridRenderer.cellIndexOf(12, 12, 'square', 50, 10, 10)).toEqual({ col: 0, row: 0 });
    expect(GridRenderer.cellIndexOf(60, 60, 'square', 50, 10, 10)).toEqual({ col: 1, row: 1 });
  });
});

describe('GridRenderer.getCellShape', () => {
  it('returns null for none', () => {
    expect(GridRenderer.getCellShape(10, 10, 'none', 50)).toBeNull();
  });

  it('returns a rect for square', () => {
    const shape = GridRenderer.getCellShape(12, 12, 'square', 50);
    expect(shape?.type).toBe('rect');
    expect(shape?.data).toEqual([0, 0, 50, 50]);
  });

  it('returns a 12-point polygon for hex grids', () => {
    const shape = GridRenderer.getCellShape(100, 100, 'hex-vertical', 50);
    expect(shape?.type).toBe('poly');
    expect(shape?.data.length).toBe(12);
  });
});

describe('GridRenderer.draw with offsets', () => {
  it('renders every type with non-zero offsets without throwing', () => {
    for (const type of ['square', 'hex-vertical', 'hex-horizontal', 'isometric'] as const) {
      const graphics = new Graphics();
      expect(() =>
        GridRenderer.draw(graphics, 800, 600, type, 50, { color: 0, alpha: 1, width: 1 }, 17, -23),
      ).not.toThrow();
      graphics.destroy();
    }
  });

  it('hex drawing covers the scene origin with positive offsets', () => {
    const graphics = new Graphics();
    GridRenderer.draw(graphics, 400, 300, 'hex-vertical', 60, { color: 0, alpha: 1, width: 1 }, 25, 35);
    const snapped = GridRenderer.snapToGrid(5, 5, 'hex-vertical', 60, 25, 35);
    expect(snapped.x).toBeGreaterThanOrEqual(-30);
    expect(snapped.x).toBeLessThanOrEqual(400 + 30);
    expect(snapped.y).toBeGreaterThanOrEqual(-30);
    expect(snapped.y).toBeLessThanOrEqual(300 + 30);
    graphics.destroy();
  });
});
