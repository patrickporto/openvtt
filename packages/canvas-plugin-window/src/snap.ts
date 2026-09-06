import type { WindowDockEdge } from '@openvtt/canvas';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Bounds {
  width: number;
  height: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: Rect[];
}

function edges(axis: 'x' | 'y', rect: Rect): [number, number] {
  return axis === 'x' ? [rect.x, rect.x + rect.width] : [rect.y, rect.y + rect.height];
}

function guideRect(axis: 'x' | 'y', at: number, a: Rect, b: Rect): Rect {
  if (axis === 'x') {
    const y = Math.min(a.y, b.y);
    const height = Math.max(a.y + a.height, b.y + b.height) - y;
    return { x: at - 1, y, width: 2, height };
  }
  const x = Math.min(a.x, b.x);
  const width = Math.max(a.x + a.width, b.x + b.width) - x;
  return { x, y: at - 1, width, height: 2 };
}

/**
 * Calcula snap de `moving` contra `targets` por proximidade de bordas
 * (left/right para x, top/bottom para y). Retorna a posição ajustada e as
 * guias visuais, ou null quando nenhuma borda está dentro do threshold.
 */
export function computeSnap(moving: Rect, targets: Rect[], threshold: number): SnapResult | null {
  let bestX: { delta: number; at: number; target: Rect } | null = null;
  let bestY: { delta: number; at: number; target: Rect } | null = null;

  const [mLeft, mRight] = edges('x', moving);
  const [mTop, mBottom] = edges('y', moving);

  for (const target of targets) {
    const [tLeft, tRight] = edges('x', target);
    const [tTop, tBottom] = edges('y', target);
    const xPairs: Array<[number, number]> = [
      [mLeft, tLeft],
      [mLeft, tRight],
      [mRight, tLeft],
      [mRight, tRight],
    ];
    for (const [from, to] of xPairs) {
      const delta = to - from;
      if (Math.abs(delta) <= threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) {
        bestX = { delta, at: to, target };
      }
    }
    const yPairs: Array<[number, number]> = [
      [mTop, tTop],
      [mTop, tBottom],
      [mBottom, tTop],
      [mBottom, tBottom],
    ];
    for (const [from, to] of yPairs) {
      const delta = to - from;
      if (Math.abs(delta) <= threshold && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) {
        bestY = { delta, at: to, target };
      }
    }
  }

  if (!bestX && !bestY) return null;
  const result: SnapResult = {
    x: bestX ? moving.x + bestX.delta : moving.x,
    y: bestY ? moving.y + bestY.delta : moving.y,
    guides: [],
  };
  const snapped: Rect = { ...moving, x: result.x, y: result.y };
  if (bestX) result.guides.push(guideRect('x', bestX.at, snapped, bestX.target));
  if (bestY) result.guides.push(guideRect('y', bestY.at, snapped, bestY.target));
  return result;
}

/**
 * Zona de docking apontada pelo ponteiro perto de uma borda do overlay.
 * `allowed` filtra as bordas habilitadas (ausente/null = todas): zonas
 * desabilitadas são ignoradas e a prioridade recai na borda seguinte.
 */
export function detectDockZone(
  px: number,
  py: number,
  bounds: Bounds,
  margin = 24,
  allowed?: readonly WindowDockEdge[] | null,
): WindowDockEdge | null {
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const enabled = (edge: WindowDockEdge): boolean => !allowed || allowed.includes(edge);
  if (py >= bounds.height - margin && enabled('bottom')) return 'bottom';
  if (px <= margin && enabled('left')) return 'left';
  if (px >= bounds.width - margin && enabled('right')) return 'right';
  return null;
}

/** Mantém a janela com o título acessível dentro dos limites do overlay. */
export function clampToBounds(rect: Rect, bounds: Bounds, minVisible = 48, titlebarVisible = 34): Rect {
  if (bounds.width <= 0 || bounds.height <= 0) return rect;
  const loX = Math.min(minVisible - rect.width, bounds.width - minVisible);
  const hiX = bounds.width - minVisible;
  const loY = 0;
  const hiY = Math.max(titlebarVisible, bounds.height - titlebarVisible);
  const x = Math.min(Math.max(rect.x, loX), hiX);
  const y = Math.min(Math.max(rect.y, loY), hiY);
  return { ...rect, x, y };
}
