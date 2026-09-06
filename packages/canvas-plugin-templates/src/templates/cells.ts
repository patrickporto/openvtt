import { GridRenderer, type GridConfig, type Point } from '@openvtt/canvas';
import { bboxOf, conePoints, rayPoints } from './geometry';

export interface TemplateFootprint {
  bounds: { x: number; y: number; width: number; height: number };
  contains(x: number, y: number): boolean;
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Área de efeito em espaço de mundo: bounding box + teste de contenção. */
export function footprintOf(
  doc: { shape: 'circle' | 'cone' | 'ray'; x: number; y: number; direction?: number; distance: number; width?: number },
  cell: number,
): TemplateFootprint {
  const length = doc.distance * cell;
  if (doc.shape === 'circle') {
    return {
      bounds: { x: doc.x - length, y: doc.y - length, width: length * 2, height: length * 2 },
      contains: (px, py) => (px - doc.x) ** 2 + (py - doc.y) ** 2 <= length * length,
    };
  }
  const points =
    doc.shape === 'cone'
      ? conePoints(doc, doc.direction ?? 0, length)
      : rayPoints(doc, doc.direction ?? 0, length, (doc.width ?? 1) * cell);
  const bounds = bboxOf(points);
  return {
    bounds,
    contains: (px, py) => pointInPolygon({ x: px, y: py }, points),
  };
}

/**
 * Centros das células afetadas pelo template — regra do centro coberto,
 * mesma convenção do highlight de grid do Foundry VTT.
 */
export function affectedCells(footprint: TemplateFootprint, grid: GridConfig): Point[] {
  const size = grid.size;
  const ox = grid.offsetX ?? 0;
  const oy = grid.offsetY ?? 0;
  const { x: minX, y: minY, width, height } = footprint.bounds;
  const maxX = minX + width;
  const maxY = minY + height;
  const cells: Point[] = [];
  const collect = (col: number, row: number): void => {
    const center = GridRenderer.cellCenterOf(col, row, grid.type, size, ox, oy);
    if (center.x < minX || center.x > maxX || center.y < minY || center.y > maxY) return;
    if (footprint.contains(center.x, center.y)) cells.push(center);
  };

  if (grid.type === 'square') {
    for (let col = Math.floor((minX - ox) / size); col * size + ox <= maxX; col++) {
      for (let row = Math.floor((minY - oy) / size); row * size + oy <= maxY; row++) collect(col, row);
    }
    return cells;
  }
  if (grid.type === 'hex-vertical' || grid.type === 'hex-horizontal') {
    const spacingX = grid.type === 'hex-vertical' ? (Math.sqrt(3) / 2) * size : size * 0.75;
    const spacingY = grid.type === 'hex-vertical' ? size * 0.75 : (Math.sqrt(3) / 2) * size;
    for (let col = Math.floor((minX - ox) / spacingX) - 1; col <= Math.ceil((maxX - ox) / spacingX) + 1; col++) {
      for (let row = Math.floor((minY - oy) / spacingY) - 1; row <= Math.ceil((maxY - oy) / spacingY) + 1; row++) {
        collect(col, row);
      }
    }
    return cells;
  }
  if (grid.type === 'isometric') {
    const u0 = Math.floor((2 * (minX - ox)) / size) - 1;
    const u1 = Math.ceil((2 * (maxX - ox)) / size) + 1;
    const v0 = Math.floor((4 * (minY - oy)) / size) - 1;
    const v1 = Math.ceil((4 * (maxY - oy)) / size) + 1;
    for (let u = u0; u <= u1; u++) {
      for (let v = v0; v <= v1; v++) {
        if ((u + v) % 2 !== 0) continue;
        collect((u + v) / 2, (v - u) / 2);
      }
    }
  }
  return cells;
}
