import { Graphics } from 'pixi.js';
import { CanvasLayer } from '../layers/CanvasLayer';
import { CONFIG } from '../config';
import type { Canvas } from '../canvas';
import type { PlaceableObject } from '../placeables/PlaceableObject';
import type { Point } from '../input/types';

export type HandleCorner = 'tl' | 'tr' | 'bl' | 'br';

/** Handles nativos do core (resize/rotação). */
export type CoreHandleInfo =
  | { type: 'resize'; corner: HandleCorner }
  | { type: 'rotate' };

/**
 * Handle customizado contribuído por plugins via hook `handles:collect`
 * (ex.: pontos/curvas de wall). `data` é opaco para o core — o plugin dono
 * interpreta durante o gesto via hook `handle:drag`.
 */
export interface CustomHandleInfo {
  type: string;
  data?: Record<string, unknown>;
}

export type HandleInfo = CoreHandleInfo | CustomHandleInfo;

/** Handle desenhável/pegável, com posição e aparência. */
export interface HandleEntry {
  info: HandleInfo;
  x: number;
  y: number;
  shape: 'square' | 'circle' | 'rotate';
  cursor?: string;
}

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const HANDLE_SCREEN = 10;
const HIT_PAD_SCREEN = 4;
const ROTATE_OFFSET_SCREEN = 26;

/** Um objeto é transformável quando o seu tipo declara um TransformAdapter. */
export function isTransformable(canvas: Canvas, obj: PlaceableObject): boolean {
  return canvas.documents.definition(obj.objectType)?.transform !== undefined;
}

/**
 * Camada de handles da seleção: caixa delimitadora, cantos de resize e handle
 * de rotação (core), mais handles customizados contribuídos por plugins.
 * Desenhada em espaço de mundo, com tamanho contra-escalado pelo zoom.
 * Nunca interativa — o hit-test é feito pela SelectTool via `pickHandle`.
 */
export class HandlesLayer extends CanvasLayer {
  private readonly canvas: Canvas;
  readonly graphics = new Graphics();

  constructor(canvas: Canvas) {
    super({ name: 'handles', zIndex: 1100, interactive: false });
    this.canvas = canvas;
    this.graphics.eventMode = 'none';
    this.addChild(this.graphics);
    this.canvas.bus.on('pan', () => this.refresh());
    this.canvas.bus.on('zoom', () => this.refresh());
  }

  get viewScale(): number {
    return this.canvas.viewport?.scale ?? 1;
  }

  getAABB(): AABB | null {
    const objects = this.canvas.selected;
    if (objects.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const obj of objects) {
      const b = obj.getAABB();
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    }
    return { minX, minY, maxX, maxY };
  }

  get transformable(): boolean {
    const objects = this.canvas.selected;
    return objects.length > 0 && objects.every((obj) => isTransformable(this.canvas, obj));
  }

  /** Handles do core: resize nos cantos + rotação acima da caixa. */
  coreHandles(): HandleEntry[] {
    const aabb = this.getAABB();
    if (!aabb || !this.transformable) return [];
    const cx = (aabb.minX + aabb.maxX) / 2;
    const rotY = aabb.minY - ROTATE_OFFSET_SCREEN / this.viewScale;
    return [
      { info: { type: 'resize', corner: 'tl' }, x: aabb.minX, y: aabb.minY, shape: 'square' },
      { info: { type: 'resize', corner: 'tr' }, x: aabb.maxX, y: aabb.minY, shape: 'square' },
      { info: { type: 'resize', corner: 'bl' }, x: aabb.minX, y: aabb.maxY, shape: 'square' },
      { info: { type: 'resize', corner: 'br' }, x: aabb.maxX, y: aabb.maxY, shape: 'square' },
      { info: { type: 'rotate' }, x: cx, y: rotY, shape: 'rotate' },
    ];
  }

  /** Handles customizados contribuídos pelos plugins (hook handles:collect). */
  customHandles(): HandleEntry[] {
    const result = this.canvas.bus.call('handles:collect', { handles: [] });
    return result.handles.map((h) => ({
      info: { type: h.type, data: (h as Record<string, unknown>).data as Record<string, unknown> | undefined },
      x: h.x,
      y: h.y,
      shape: h.shape ?? 'circle',
      cursor: h.cursor,
    }));
  }

  allHandles(): HandleEntry[] {
    return [...this.customHandles(), ...this.coreHandles()];
  }

  pickHandle(point: Point): HandleEntry | null {
    if (this.canvas.interactionDisabled) return null;
    if (this.canvas.getCurrentToolId() !== 'select') return null;
    const tol = (HANDLE_SCREEN / 2 + HIT_PAD_SCREEN) / this.viewScale;
    for (const handle of this.allHandles()) {
      if (Math.abs(point.x - handle.x) <= tol && Math.abs(point.y - handle.y) <= tol) return handle;
    }
    return null;
  }

  refresh(): void {
    const g = this.graphics;
    g.clear();
    if (this.canvas.interactionDisabled) return;
    if (this.canvas.getCurrentToolId() !== 'select') return;
    const aabb = this.getAABB();
    if (!aabb) return;
    const lw = 1.5 / this.viewScale;
    const color = CONFIG.selection.color;
    const hs = HANDLE_SCREEN / this.viewScale;
    g.rect(aabb.minX, aabb.minY, aabb.maxX - aabb.minX, aabb.maxY - aabb.minY).stroke({
      color,
      width: lw,
      alpha: 0.9,
    });
    for (const handle of this.allHandles()) {
      if (handle.shape === 'square') {
        g.rect(handle.x - hs / 2, handle.y - hs / 2, hs, hs)
          .fill(0xffffff)
          .stroke({ color, width: lw });
      } else if (handle.shape === 'rotate') {
        const r = hs / 2;
        g.moveTo(handle.x, aabb.minY)
          .lineTo(handle.x, handle.y + r)
          .stroke({ color, width: lw, alpha: 0.6 });
        g.circle(handle.x, handle.y, r)
          .fill(0xffffff)
          .stroke({ color, width: lw });
      } else {
        g.circle(handle.x, handle.y, hs / 2)
          .fill(0xffffff)
          .stroke({ color, width: lw });
      }
    }
  }

  clear(): void {
    this.graphics.clear();
  }

  override async tearDown(): Promise<void> {
    this.clear();
  }
}
