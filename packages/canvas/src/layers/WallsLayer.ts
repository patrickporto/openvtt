import { PlaceablesLayer } from './PlaceablesLayer';
import type { CanvasLike } from '../placeables/PlaceableObject';
import { Wall } from '../placeables/Wall';
import type { WallData, WallDataInput, WallSegmentData } from '../schemas';
import type { CanvasBus } from '../bus';
import { pointToCurveDistance } from '../geometry';

export type WallPointRole = 'p1' | 'p2' | 'cp1' | 'cp2';

export interface WallPointRef {
  wallId: string;
  segmentIndex: number;
  role: WallPointRole;
  x: number;
  y: number;
}

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

export class WallsLayer extends PlaceablesLayer<WallData, Wall, WallDataInput> {
  constructor(canvas: CanvasLike) {
    super({ name: 'walls', zIndex: 60, objectClass: Wall, canvas });
  }

  protected override emitCreate(document: WallData & { id: string }): void {
    (this.canvas.bus as CanvasBus).emit('wall:create', { ...document, id: document.id });
  }
  protected override emitUpdate(document: WallData): void {
    (this.canvas.bus as CanvasBus).emit('wall:update', { ...document });
  }
  protected override emitDelete(id: string): void {
    (this.canvas.bus as CanvasBus).emit('wall:delete', { id });
  }

  /** Segmento (curvo ou não) mais próximo do ponto dentro da tolerância. */
  findSegmentAt(
    point: { x: number; y: number },
    tolerance: number,
  ): { wall: Wall; segmentIndex: number; distance: number; t: number } | null {
    let best: { wall: Wall; segmentIndex: number; distance: number; t: number } | null = null;
    for (const wall of this.placeables) {
      wall.segments.forEach((seg, segmentIndex) => {
        const hit = pointToCurveDistance(point, seg);
        if (hit.distance <= tolerance && (!best || hit.distance < best.distance)) {
          best = { wall, segmentIndex, distance: hit.distance, t: hit.t };
        }
      });
    }
    return best;
  }

  /** Todos os pontos manipuláveis (endpoints + pontos de controle) das walls indicadas. */
  listPoints(wallIds?: Set<string>): WallPointRef[] {
    const refs: WallPointRef[] = [];
    for (const wall of this.placeables) {
      if (wallIds && !wallIds.has(wall.id)) continue;
      wall.segments.forEach((seg, segmentIndex) => {
        for (const role of wallPointRoles(seg)) {
          const point = role === 'p1'
            ? { x: seg.x1, y: seg.y1 }
            : role === 'p2'
              ? { x: seg.x2, y: seg.y2 }
              : role === 'cp1'
                ? { x: seg.cp1x ?? seg.x1, y: seg.cp1y ?? seg.y1 }
                : { x: seg.cp2x ?? seg.x2, y: seg.cp2y ?? seg.y2 };
          refs.push({ wallId: wall.id, segmentIndex, role, x: point.x, y: point.y });
        }
      });
    }
    return refs;
  }

  /** Endpoints (junções) coincidentes com (x, y), exceto o ponto arrastado. */
  findCoincidentEndpoints(x: number, y: number, tolerance: number, exclude: WallPointRef): WallPointRef[] {
    const refs: WallPointRef[] = [];
    for (const ref of this.listPoints()) {
      if (ref.role !== 'p1' && ref.role !== 'p2') continue;
      if (ref.wallId === exclude.wallId && ref.segmentIndex === exclude.segmentIndex && ref.role === exclude.role) continue;
      if (Math.hypot(ref.x - x, ref.y - y) <= tolerance) refs.push(ref);
    }
    return refs;
  }
}
