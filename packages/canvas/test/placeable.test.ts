import { describe, expect, it } from 'bun:test';
import { PlaceableObject, type CanvasLike } from '../src/placeables/PlaceableObject';

const canvasLike = {
  bus: {},
  grid: { type: 'square' as const, size: 50 },
  selection: new Set<string>(),
} as unknown as CanvasLike;

interface FakeDoc {
  width: number;
  height: number;
}

class FakePlaceable extends PlaceableObject<FakeDoc> {
  readonly objectType = 'fake';

  constructor(
    x: number,
    y: number,
    rotation: number,
    private readonly local: { x: number; y: number; width: number; height: number },
  ) {
    super({ x, y, rotation, width: local.width, height: local.height }, canvasLike);
  }

  get bounds() {
    return this.local;
  }

  refresh(): void {}
}

describe('PlaceableObject.getSelectionFrame', () => {
  it('unrotated corner-anchored rect centers on the bounds', () => {
    const p = new FakePlaceable(300, 300, 0, { x: 0, y: 0, width: 100, height: 100 });
    expect(p.getSelectionFrame()).toEqual({ cx: 350, cy: 350, width: 100, height: 100, angle: 0 });
  });

  it('rotating a corner-anchored rect rotates the local center offset around the origin', () => {
    const p = new FakePlaceable(300, 300, Math.PI / 4, { x: 0, y: 0, width: 100, height: 100 });
    const frame = p.getSelectionFrame();
    const half = Math.SQRT1_2 * 50;
    expect(frame.cx).toBeCloseTo(300, 5);
    expect(frame.cy).toBeCloseTo(300 + 2 * half, 5);
    expect(frame.width).toBe(100);
    expect(frame.height).toBe(100);
    expect(frame.angle).toBeCloseTo(Math.PI / 4, 5);
  });

  it('rotating a centered placeable keeps the frame centered (token-like)', () => {
    const p = new FakePlaceable(300, 300, Math.PI / 4, { x: -50, y: -50, width: 100, height: 100 });
    const frame = p.getSelectionFrame();
    expect(frame.cx).toBeCloseTo(300, 5);
    expect(frame.cy).toBeCloseTo(300, 5);
    expect(frame.width).toBe(100);
    expect(frame.height).toBe(100);
    expect(frame.angle).toBeCloseTo(Math.PI / 4, 5);
  });
});

describe('PlaceableObject.getAABB', () => {
  it('unrotated rect returns the exact bounds', () => {
    const p = new FakePlaceable(300, 300, 0, { x: 0, y: 0, width: 100, height: 100 });
    expect(p.getAABB()).toEqual({ minX: 300, minY: 300, maxX: 400, maxY: 400 });
  });

  it('rotated corner-anchored rect encloses the rotated corners exactly', () => {
    const p = new FakePlaceable(300, 300, Math.PI / 4, { x: 0, y: 0, width: 100, height: 100 });
    const diag = Math.SQRT1_2 * 100;
    const aabb = p.getAABB();
    expect(aabb.minX).toBeCloseTo(300 - diag, 5);
    expect(aabb.maxX).toBeCloseTo(300 + diag, 5);
    expect(aabb.minY).toBeCloseTo(300, 5);
    expect(aabb.maxY).toBeCloseTo(300 + 2 * diag, 5);
    expect((aabb.minX + aabb.maxX) / 2).toBeCloseTo(p.getSelectionFrame().cx, 5);
    expect((aabb.minY + aabb.maxY) / 2).toBeCloseTo(p.getSelectionFrame().cy, 5);
  });

  it('rotated centered placeable matches the previous half-extent formula', () => {
    const p = new FakePlaceable(300, 300, Math.PI / 4, { x: -50, y: -50, width: 100, height: 100 });
    const aabb = p.getAABB();
    const extent = 50 * Math.SQRT1_2 + 50 * Math.SQRT1_2;
    expect(aabb.minX).toBeCloseTo(300 - extent, 5);
    expect(aabb.maxX).toBeCloseTo(300 + extent, 5);
    expect(aabb.minY).toBeCloseTo(300 - extent, 5);
    expect(aabb.maxY).toBeCloseTo(300 + extent, 5);
  });
});
