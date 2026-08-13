import type { Point } from '../input/types';

export const CONE_ANGLE = Math.PI / 3;

/** Pontos do cone: ápice + arco de `angle` radianos na direção dada. */
export function conePoints(apex: Point, direction: number, length: number, angle = CONE_ANGLE, arcSteps = 24): Point[] {
  const points: Point[] = [{ x: apex.x, y: apex.y }];
  const start = direction - angle / 2;
  for (let i = 0; i <= arcSteps; i++) {
    const a = start + (angle * i) / arcSteps;
    points.push({ x: apex.x + Math.cos(a) * length, y: apex.y + Math.sin(a) * length });
  }
  return points;
}

/** Retângulo do raio: da origem, `length` na direção, `width` perpendicular centrado. */
export function rayPoints(origin: Point, direction: number, length: number, width: number): Point[] {
  const dx = Math.cos(direction);
  const dy = Math.sin(direction);
  const px = -dy * (width / 2);
  const py = dx * (width / 2);
  return [
    { x: origin.x + px, y: origin.y + py },
    { x: origin.x - px, y: origin.y - py },
    { x: origin.x + dx * length - px, y: origin.y + dy * length - py },
    { x: origin.x + dx * length + px, y: origin.y + dy * length + py },
  ];
}

export function bboxOf(points: Point[]): { x: number; y: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
