import { describe, expect, test } from 'bun:test';
import { computeVisibilityPolygon, raySegmentT } from '../src/fog/visibility';

describe('raySegmentT', () => {
  test('hits a perpendicular segment', () => {
    const t = raySegmentT({ x: 0, y: 0 }, { x: 1, y: 0 }, { x1: 2, y1: -1, x2: 2, y2: 1 });
    expect(t).toBeCloseTo(2);
  });

  test('misses when the segment is behind the ray', () => {
    expect(raySegmentT({ x: 0, y: 0 }, { x: -1, y: 0 }, { x1: 2, y1: -1, x2: 2, y2: 1 })).toBeNull();
  });

  test('misses outside the segment range', () => {
    expect(raySegmentT({ x: 0, y: 0 }, { x: 1, y: 0 }, { x1: 2, y1: 5, x2: 2, y2: 10 })).toBeNull();
  });

  test('misses parallel rays', () => {
    expect(raySegmentT({ x: 0, y: 0 }, { x: 1, y: 0 }, { x1: 0, y1: 1, x2: 5, y2: 1 })).toBeNull();
  });
});

function polygonArea(points: { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

describe('computeVisibilityPolygon', () => {
  test('without walls the polygon approximates a circle of the given radius', () => {
    const poly = computeVisibilityPolygon({ x: 0, y: 0 }, 100, []);
    const area = polygonArea(poly);
    const circle = Math.PI * 100 * 100;
    expect(Math.abs(area - circle) / circle).toBeLessThan(0.02);
  });

  test('a wall blocks vision directly behind it', () => {
    const wall = { x1: -60, y1: -50, x2: 60, y2: -50 };
    const poly = computeVisibilityPolygon({ x: 0, y: 0 }, 200, [wall]);
    // straight up (-y) the polygon must stop at the wall (y ≈ -50), not at the radius
    const up = poly.reduce((best, p) => (p.y < best.y && Math.abs(p.x) < 1 ? p : best), { x: 0, y: 0 });
    const straightUp = poly.filter((p) => Math.abs(p.x) < 2);
    const minY = Math.min(...straightUp.map((p) => p.y));
    expect(minY).toBeGreaterThan(-55);
    expect(up).toBeDefined();
  });

  test('vision never exceeds the radius even with walls', () => {
    const wall = { x1: -60, y1: -50, x2: 60, y2: -50 };
    const poly = computeVisibilityPolygon({ x: 10, y: 20 }, 120, [wall]);
    for (const p of poly) {
      const d = Math.hypot(p.x - 10, p.y - 20);
      expect(d).toBeLessThanOrEqual(120.001);
    }
  });

  test('corners produce sharp shadow edges (points past the wall beside it)', () => {
    const wall = { x1: -50, y1: -50, x2: 50, y2: -50 };
    const poly = computeVisibilityPolygon({ x: 0, y: 0 }, 200, [wall]);
    // diagonally past the wall end (x large, y just above the wall) vision reaches near the radius
    const farRight = poly.filter((p) => p.x > 150 && p.y < 0);
    expect(farRight.length).toBeGreaterThan(0);
  });
});
