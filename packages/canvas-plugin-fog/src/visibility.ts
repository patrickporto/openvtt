import type { Point } from '@openvtt/canvas';

export interface VisionSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Interseção raio × segmento. Retorna o parâmetro t ao longo do raio
 * (origem + t·dir), ou null quando não há interseção no intervalo do segmento.
 */
export function raySegmentT(origin: Point, dir: Point, seg: VisionSegment): number | null {
  const sx = seg.x2 - seg.x1;
  const sy = seg.y2 - seg.y1;
  const det = -dir.x * sy + dir.y * sx;
  if (Math.abs(det) < 1e-12) return null;
  const ax = seg.x1 - origin.x;
  const ay = seg.y1 - origin.y;
  const t = (-ax * sy + ay * sx) / det;
  const u = (dir.x * ay - dir.y * ax) / det;
  if (t < 0 || u < 0 || u > 1) return null;
  return t;
}

const EPSILON = 1e-4;

/**
 * Polígono de visão de um ponto com raio máximo, bloqueado por segmentos
 * (walls com `sight`). Combina raios uniformes (borda circular suave) com
 * raios mirando cada vértice ±ε (sombras exatas atrás das paredes).
 * Retornado ordenado por ângulo, pronto para Graphics.poly.
 */
export function computeVisibilityPolygon(
  origin: Point,
  radius: number,
  segments: VisionSegment[],
  uniformRays = 180,
): Point[] {
  const angles: number[] = [];
  for (let i = 0; i < uniformRays; i++) angles.push((i / uniformRays) * Math.PI * 2);
  for (const seg of segments) {
    const a1 = Math.atan2(seg.y1 - origin.y, seg.x1 - origin.x);
    const a2 = Math.atan2(seg.y2 - origin.y, seg.x2 - origin.x);
    angles.push(a1 - EPSILON, a1, a1 + EPSILON, a2 - EPSILON, a2, a2 + EPSILON);
  }

  const points: (Point & { angle: number })[] = [];
  for (const angle of angles) {
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    let t = radius;
    for (const seg of segments) {
      const hit = raySegmentT(origin, dir, seg);
      if (hit !== null && hit < t) t = hit;
    }
    points.push({ x: origin.x + dir.x * t, y: origin.y + dir.y * t, angle: normalizeAngle(angle) });
  }
  points.sort((a, b) => a.angle - b.angle);
  return points.map(({ x, y }) => ({ x, y }));
}

function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  return ((angle % twoPi) + twoPi) % twoPi;
}
