import { describe, expect, it } from 'bun:test';
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
