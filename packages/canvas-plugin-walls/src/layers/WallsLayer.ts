import type { PlaceablesLayer } from '@openvtt/canvas';
import type { Wall } from '../placeables/Wall';
import type { WallData, WallDataInput, WallSegmentData } from '../schemas';
import { pointToCurveDistance } from '../geometry';

export type WallPointRole = 'p1' | 'p2' | 'cp1' | 'cp2';

export interface WallPointRef {
  wallId: string;
  segmentIndex: number;
  role: WallPointRole;
  x: number;
  y: number;
}

export type WallsLayer = PlaceablesLayer<WallData, Wall, WallDataInput>;

export function wallPointRoles(seg: WallSegmentData): WallPointRole[] {
  const roles: WallPointRole[] = ['p1', 'p2'];
  if (seg.curve === 'quadratic') roles.push('cp1');
  if (seg.curve === 'cubic') roles.push('cp1', 'cp2');
  return roles;
}

export function withPointAt(seg: WallSegmentData, role: WallPointRole, x: number, y: number): WallSegmentData {
  switch (role) {
    case 'p1':
      return { ...seg, x1: x, y1: y };
    case 'p2':
      return { ...seg, x2: x, y2: y };
    case 'cp1':
      return { ...seg, cp1x: x, cp1y: y };
    case 'cp2':
      return { ...seg, cp2x: x, cp2y: y };
  }
}

export function findWallSegmentAt(
  layer: WallsLayer,
  point: { x: number; y: number },
  tolerance: number,
): { wall: Wall; segmentIndex: number; distance: number; t: number } | null {
  let best: { wall: Wall; segmentIndex: number; distance: number; t: number } | null = null;
  for (const wall of layer.placeables) {
    for (let segmentIndex = 0; segmentIndex < wall.segments.length; segmentIndex++) {
      const seg = wall.segments[segmentIndex];
      const hit = pointToCurveDistance(point, seg);
      if (hit.distance <= tolerance && (best === null || hit.distance < best.distance)) {
        best = { wall, segmentIndex, distance: hit.distance, t: hit.t };
      }
    }
  }
  return best;
}

export function listWallPoints(layer: WallsLayer, wallIds?: Set<string>): WallPointRef[] {
  const refs: WallPointRef[] = [];
  for (const wall of layer.placeables) {
    if (wallIds && !wallIds.has(wall.id)) continue;
    wall.segments.forEach((seg, segmentIndex) => {
      for (const role of wallPointRoles(seg)) {
        const x = role === 'p1'
          ? seg.x1
          : role === 'p2'
            ? seg.x2
            : role === 'cp1'
              ? (seg.cp1x ?? seg.x1)
              : (seg.cp2x ?? seg.x2);
        const y = role === 'p1'
          ? seg.y1
          : role === 'p2'
            ? seg.y2
            : role === 'cp1'
              ? (seg.cp1y ?? seg.y1)
              : (seg.cp2y ?? seg.y2);
        refs.push({ wallId: wall.id, segmentIndex, role, x, y });
      }
    });
  }
  return refs;
}

export function findCoincidentEndpoints(layer: WallsLayer, x: number, y: number, tolerance: number, exclude: WallPointRef): WallPointRef[] {
  const refs: WallPointRef[] = [];
  for (const ref of listWallPoints(layer)) {
    if (ref.role !== 'p1' && ref.role !== 'p2') continue;
    if (ref.wallId === exclude.wallId && ref.segmentIndex === exclude.segmentIndex && ref.role === exclude.role) continue;
    if (Math.hypot(ref.x - x, ref.y - y) <= tolerance) refs.push(ref);
  }
  return refs;
}
