import type { WallSegmentData } from './schemas';

export interface CurvePoint {
  x: number;
  y: number;
}

function lerpPoint(a: CurvePoint, b: CurvePoint, t: number): CurvePoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function endpoints(seg: WallSegmentData): { p0: CurvePoint; c1: CurvePoint; c2: CurvePoint; p1: CurvePoint } {
  const p0 = { x: seg.x1, y: seg.y1 };
  const p1 = { x: seg.x2, y: seg.y2 };
  return {
    p0,
    c1: { x: seg.cp1x ?? seg.x1, y: seg.cp1y ?? seg.y1 },
    c2: { x: seg.cp2x ?? seg.x2, y: seg.cp2y ?? seg.y2 },
    p1,
  };
}

export function curvePointAt(seg: WallSegmentData, t: number): CurvePoint {
  const { p0, c1, c2, p1 } = endpoints(seg);
  if (seg.curve === 'quadratic') {
    const q0 = lerpPoint(p0, c1, t);
    const q1 = lerpPoint(c1, p1, t);
    return lerpPoint(q0, q1, t);
  }
  if (seg.curve === 'cubic') {
    const q0 = lerpPoint(p0, c1, t);
    const q1 = lerpPoint(c1, c2, t);
    const q2 = lerpPoint(c2, p1, t);
    const r0 = lerpPoint(q0, q1, t);
    const r1 = lerpPoint(q1, q2, t);
    return lerpPoint(r0, r1, t);
  }
  return lerpPoint(p0, p1, t);
}

export function flattenSegment(seg: WallSegmentData, subdivisions = 24): CurvePoint[] {
  const points: CurvePoint[] = [];
  for (let i = 0; i <= subdivisions; i++) points.push(curvePointAt(seg, i / subdivisions));
  return points;
}

export function segmentLength(seg: WallSegmentData): number {
  const points = flattenSegment(seg);
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return length;
}

export function pointToCurveDistance(
  p: CurvePoint,
  seg: WallSegmentData,
  subdivisions = 48,
): { distance: number; t: number; point: CurvePoint } {
  const points = flattenSegment(seg, subdivisions);
  let best = { distance: Infinity, t: 0, point: points[0] };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const chordT = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
    const point = { x: a.x + chordT * dx, y: a.y + chordT * dy };
    const distance = Math.hypot(p.x - point.x, p.y - point.y);
    if (distance < best.distance) best = { distance, t: (i - 1 + chordT) / subdivisions, point };
  }
  return best;
}

export function splitSegment(seg: WallSegmentData, t: number): [WallSegmentData, WallSegmentData] {
  const { p0, c1, c2, p1 } = endpoints(seg);
  const shared = { curve: seg.curve, door: seg.door, doorOpen: seg.doorOpen, movement: seg.movement, sight: seg.sight, sound: seg.sound, secret: seg.secret };
  if (seg.curve === 'quadratic') {
    const q0 = lerpPoint(p0, c1, t);
    const q1 = lerpPoint(c1, p1, t);
    const b = lerpPoint(q0, q1, t);
    return [
      { ...shared, x1: p0.x, y1: p0.y, x2: b.x, y2: b.y, curve: 'quadratic', cp1x: q0.x, cp1y: q0.y },
      { ...shared, x1: b.x, y1: b.y, x2: p1.x, y2: p1.y, curve: 'quadratic', cp1x: q1.x, cp1y: q1.y },
    ];
  }
  if (seg.curve === 'cubic') {
    const q0 = lerpPoint(p0, c1, t);
    const q1 = lerpPoint(c1, c2, t);
    const q2 = lerpPoint(c2, p1, t);
    const r0 = lerpPoint(q0, q1, t);
    const r1 = lerpPoint(q1, q2, t);
    const b = lerpPoint(r0, r1, t);
    return [
      { ...shared, x1: p0.x, y1: p0.y, x2: b.x, y2: b.y, curve: 'cubic', cp1x: q0.x, cp1y: q0.y, cp2x: r0.x, cp2y: r0.y },
      { ...shared, x1: b.x, y1: b.y, x2: p1.x, y2: p1.y, curve: 'cubic', cp1x: r1.x, cp1y: r1.y, cp2x: q2.x, cp2y: q2.y },
    ];
  }
  const b = lerpPoint(p0, p1, t);
  return [
    { ...shared, x1: p0.x, y1: p0.y, x2: b.x, y2: b.y },
    { ...shared, x1: b.x, y1: b.y, x2: p1.x, y2: p1.y },
  ];
}

export function rdpSimplify(points: CurvePoint[], tolerance: number): CurvePoint[] {
  if (points.length <= 2) return points.slice();
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    const a = points[first];
    const b = points[last];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    let maxDistance = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const p = points[i];
      let distance: number;
      if (lengthSq === 0) {
        distance = Math.hypot(p.x - a.x, p.y - a.y);
      } else {
        const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
        distance = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
      }
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }
    if (index !== -1 && maxDistance > tolerance) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export type SegmentSpec = Pick<WallSegmentData, 'x1' | 'y1' | 'x2' | 'y2'> & Partial<WallSegmentData>;

export function chainSegments(points: CurvePoint[], extra?: Partial<WallSegmentData>): SegmentSpec[] {
  const segments: SegmentSpec[] = [];
  for (let i = 1; i < points.length; i++) {
    segments.push({ x1: points[i - 1].x, y1: points[i - 1].y, x2: points[i].x, y2: points[i].y, ...extra });
  }
  return segments;
}

export function ellipsePoints(cx: number, cy: number, rx: number, ry: number, count: number, startAngle = 0, sweep = Math.PI * 2): CurvePoint[] {
  const points: CurvePoint[] = [];
  for (let i = 0; i <= count; i++) {
    const angle = startAngle + (sweep * i) / count;
    points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  }
  return points;
}

export function rectPoints(x: number, y: number, width: number, height: number, perSide: number): CurvePoint[] {
  const points: CurvePoint[] = [];
  const sides: [CurvePoint, CurvePoint][] = [
    [{ x, y }, { x: x + width, y }],
    [{ x: x + width, y }, { x: x + width, y: y + height }],
    [{ x: x + width, y: y + height }, { x, y: y + height }],
    [{ x, y: y + height }, { x, y }],
  ];
  for (const [a, b] of sides) {
    for (let i = 0; i < perSide; i++) points.push(lerpPoint(a, b, i / perSide));
  }
  points.push({ x, y });
  return points;
}
