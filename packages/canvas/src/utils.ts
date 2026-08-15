import { v7 as uuidv7 } from 'uuid';

export function newId(): string {
  return uuidv7();
}

export function toHex(color: string | number): number {
  if (typeof color === 'number') return color;
  if (typeof color !== 'string') return 0xffffff;
  const trimmed = color.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const normalized = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  const hex = normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized;
  const value = parseInt(hex, 16);
  return Number.isNaN(value) ? 0xffffff : value;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export interface Rectangle { x: number; y: number; width: number; height: number; }

export function rectanglesIntersect(a: Rectangle, b: Rectangle): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Passo de suavização exponencial em direção ao alvo (frame-rate
 * independente): a cada tick aproxima `current` de `target` com constante de
 * tempo derivada de `durationMs`. Usado pelo drag suavizado (TokenEase-style).
 */
export function easeTowards(
  current: { x: number; y: number },
  target: { x: number; y: number },
  dtMs: number,
  durationMs: number,
): { x: number; y: number } {
  if (dtMs <= 0) return { x: current.x, y: current.y };
  const tau = Math.max(1, durationMs) / 3;
  const k = 1 - Math.exp(-dtMs / tau);
  return {
    x: current.x + (target.x - current.x) * k,
    y: current.y + (target.y - current.y) * k,
  };
}

/** Interseção entre os segmentos (a1→a2) e (b1→b2), por orientação. */
export function segmentsIntersect(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): boolean {
  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function cross(o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Distância de um ponto a um segmento (para hit-test de portas). */
export function pointToSegmentDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
