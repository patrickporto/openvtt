import { describe, expect, it } from 'bun:test';
import {
  chainSegments,
  curvePointAt,
  ellipsePoints,
  flattenSegment,
  pointToCurveDistance,
  rdpSimplify,
  rectPoints,
  segmentLength,
  splitSegment,
} from '../src/geometry';
import type { WallSegmentData } from '../src/schemas';

function seg(partial: Partial<WallSegmentData> & Pick<WallSegmentData, 'x1' | 'y1' | 'x2' | 'y2'>): WallSegmentData {
  return {
    curve: 'linear',
    door: false,
    doorOpen: false,
    secret: false,
    movement: true,
    sight: true,
    sound: false,
    ...partial,
  };
}

describe('curvePointAt / flattenSegment', () => {
  it('linear midpoint', () => {
    const p = curvePointAt(seg({ x1: 0, y1: 0, x2: 100, y2: 0 }), 0.5);
    expect(p).toEqual({ x: 50, y: 0 });
  });

  it('quadratic midpoint follows the bezier', () => {
    const s = seg({ x1: 0, y1: 0, x2: 100, y2: 0, curve: 'quadratic', cp1x: 50, cp1y: 100 });
    const p = curvePointAt(s, 0.5);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(50);
  });

  it('flatten keeps endpoints and count', () => {
    const s = seg({ x1: 10, y1: 20, x2: 110, y2: 220, curve: 'cubic', cp1x: 40, cp1y: 300, cp2x: 80, cp2y: -50 });
    const points = flattenSegment(s, 16);
    expect(points).toHaveLength(17);
    expect(points[0]).toEqual({ x: 10, y: 20 });
    expect(points[16]).toEqual({ x: 110, y: 220 });
  });
});

describe('splitSegment', () => {
  it('splits a linear segment preserving flags', () => {
    const [a, b] = splitSegment(seg({ x1: 0, y1: 0, x2: 100, y2: 0, door: true, secret: true }), 0.25);
    expect(a).toMatchObject({ x1: 0, y1: 0, x2: 25, y2: 0, door: true, secret: true, curve: 'linear' });
    expect(b).toMatchObject({ x1: 25, y1: 0, x2: 100, y2: 0, door: true, secret: true });
  });

  it('splits a quadratic curve at the curve point (De Casteljau)', () => {
    const s = seg({ x1: 0, y1: 0, x2: 100, y2: 0, curve: 'quadratic', cp1x: 50, cp1y: 100 });
    const [a, b] = splitSegment(s, 0.5);
    expect(a.x1).toBeCloseTo(0);
    expect(a.cp1x).toBeCloseTo(25);
    expect(a.cp1y).toBeCloseTo(50);
    expect(a.x2).toBeCloseTo(50);
    expect(a.y2).toBeCloseTo(50);
    expect(b.x1).toBeCloseTo(50);
    expect(b.y1).toBeCloseTo(50);
    expect(b.cp1x).toBeCloseTo(75);
    expect(b.x2).toBeCloseTo(100);
    const rejoined = curvePointAt(a, 1);
    expect(rejoined.x).toBeCloseTo(b.x1);
    expect(rejoined.y).toBeCloseTo(b.y1);
  });

  it('splits a cubic curve keeping continuity', () => {
    const s = seg({ x1: 0, y1: 0, x2: 120, y2: 0, curve: 'cubic', cp1x: 30, cp1y: 90, cp2x: 90, cp2y: -90 });
    const [a, b] = splitSegment(s, 0.5);
    const mid = curvePointAt(s, 0.5);
    expect(a.x2).toBeCloseTo(mid.x);
    expect(a.y2).toBeCloseTo(mid.y);
    expect(b.x1).toBeCloseTo(mid.x);
    expect(b.y1).toBeCloseTo(mid.y);
    expect(a.curve).toBe('cubic');
    expect(b.curve).toBe('cubic');
  });
});

describe('pointToCurveDistance', () => {
  it('matches perpendicular distance on linear segments', () => {
    const hit = pointToCurveDistance({ x: 50, y: 30 }, seg({ x1: 0, y1: 0, x2: 100, y2: 0 }));
    expect(hit.distance).toBeCloseTo(30);
    expect(hit.t).toBeCloseTo(0.5, 1);
  });

  it('finds the arc of a quadratic curve', () => {
    const s = seg({ x1: 0, y1: 0, x2: 100, y2: 0, curve: 'quadratic', cp1x: 50, cp1y: 100 });
    const hit = pointToCurveDistance({ x: 50, y: 50 }, s);
    expect(hit.distance).toBeLessThan(1);
    expect(hit.t).toBeGreaterThan(0.4);
    expect(hit.t).toBeLessThan(0.6);
  });
});

describe('rdpSimplify', () => {
  it('collapses colinear runs', () => {
    const points = Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 0 }));
    expect(rdpSimplify(points, 1)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  });

  it('keeps spikes above tolerance', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 20 },
      { x: 100, y: 0 },
    ];
    expect(rdpSimplify(points, 10)).toHaveLength(3);
    expect(rdpSimplify(points, 25)).toHaveLength(2);
  });
});

describe('shape generators', () => {
  it('ellipsePoints closes the loop at full sweep', () => {
    const points = ellipsePoints(100, 100, 50, 30, 16);
    expect(points).toHaveLength(17);
    expect(points[0].x).toBeCloseTo(points[16].x);
    expect(points[0].y).toBeCloseTo(points[16].y);
    expect(points[0].x).toBeCloseTo(150);
    expect(points[4].y).toBeCloseTo(130);
  });

  it('rectPoints makes a closed loop with perSide subdivisions', () => {
    const points = rectPoints(0, 0, 100, 50, 2);
    expect(points).toHaveLength(9);
    expect(points[0]).toEqual(points[8]);
    expect(points[2]).toEqual({ x: 100, y: 0 });
    expect(chainSegments(points)).toHaveLength(8);
  });

  it('chainSegments links consecutive points', () => {
    const segments = chainSegments([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], { door: true });
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ x1: 0, y1: 0, x2: 10, y2: 0, door: true });
    expect(segments[1]).toMatchObject({ x1: 10, y1: 0, x2: 10, y2: 10 });
  });
});

describe('segmentLength', () => {
  it('linear equals euclidean distance', () => {
    expect(segmentLength(seg({ x1: 0, y1: 0, x2: 30, y2: 40 }))).toBeCloseTo(50);
  });

  it('curved is longer than the chord', () => {
    const s = seg({ x1: 0, y1: 0, x2: 100, y2: 0, curve: 'quadratic', cp1x: 50, cp1y: 100 });
    const length = segmentLength(s);
    expect(length).toBeGreaterThan(100);
    expect(length).toBeLessThan(200);
  });
});
