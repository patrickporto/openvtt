import { Graphics } from 'pixi.js';
import { CanvasLayer } from '../layers/CanvasLayer';
import { CONFIG } from '../config';
import type { Canvas } from '../canvas';
import type { PlaceableObject, SelectionFrame } from '../placeables/PlaceableObject';
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
    return objects.length > 0 && objects.every((obj) => !obj.isLocked && isTransformable(this.canvas, obj));
  }

  /**
   * Centro do gesto de rotação: o pivo declarado pelo tipo do documento
   * (ex.: ponta do cone) quando há um único objeto selecionado, senão o
   * centro do AABB da seleção.
   */
  getRotationCenter(): Point | null {
    const objects = this.canvas.selected;
    if (objects.length === 1) {
      const obj = objects[0];
      const pivot = this.canvas.documents.definition(obj.objectType)?.transform?.rotationPivot?.(obj);
      if (pivot) return pivot;
    }
    const aabb = this.getAABB();
    if (!aabb) return null;
    return { x: (aabb.minX + aabb.maxX) / 2, y: (aabb.minY + aabb.maxY) / 2 };
  }

  /**
   * Frame orientado da seleção: com um único objeto selecionado a caixa e os
   * handles giram junto com ele; seleções múltiplas usam o AABB combinado.
   */
  get selectionFrame(): SelectionFrame | null {
    const objects = this.canvas.selected;
    if (objects.length !== 1) return null;
    return objects[0].getSelectionFrame();
  }

  private framePoint(frame: SelectionFrame, fx: number, fy: number): Point {
    const cos = Math.cos(frame.angle);
    const sin = Math.sin(frame.angle);
    return { x: frame.cx + fx * cos - fy * sin, y: frame.cy + fx * sin + fy * cos };
  }

  /** Handles do core: resize nos cantos + rotação acima da caixa. */
  coreHandles(): HandleEntry[] {
    const aabb = this.getAABB();
    if (!aabb || !this.transformable) return [];
    const frame = this.selectionFrame;
    if (!frame) {
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
    const hw = frame.width / 2;
    const hh = frame.height / 2;
    const off = ROTATE_OFFSET_SCREEN / this.viewScale;
    const corners: Array<[HandleCorner, number, number]> = [
      ['tl', -hw, -hh],
      ['tr', hw, -hh],
      ['bl', -hw, hh],
      ['br', hw, hh],
    ];
    const handles: HandleEntry[] = corners.map(([corner, fx, fy]) => {
      const p = this.framePoint(frame, fx, fy);
      return { info: { type: 'resize', corner }, x: p.x, y: p.y, shape: 'square' };
    });
    const rot = this.framePoint(frame, 0, -hh - off);
    handles.push({ info: { type: 'rotate' }, x: rot.x, y: rot.y, shape: 'rotate' });
    return handles;
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
    const frame = this.selectionFrame;
    if (frame) {
      const hw = frame.width / 2;
      const hh = frame.height / 2;
      const tl = this.framePoint(frame, -hw, -hh);
      const tr = this.framePoint(frame, hw, -hh);
      const br = this.framePoint(frame, hw, hh);
      const bl = this.framePoint(frame, -hw, hh);
      g.moveTo(tl.x, tl.y)
        .lineTo(tr.x, tr.y)
        .lineTo(br.x, br.y)
        .lineTo(bl.x, bl.y)
        .closePath()
        .stroke({ color, width: lw, alpha: 0.9 });
    } else {
      g.rect(aabb.minX, aabb.minY, aabb.maxX - aabb.minX, aabb.maxY - aabb.minY).stroke({
        color,
        width: lw,
        alpha: 0.9,
      });
    }
    for (const handle of this.allHandles()) {
      if (handle.shape === 'square') {
        g.rect(handle.x - hs / 2, handle.y - hs / 2, hs, hs)
          .fill(0xffffff)
          .stroke({ color, width: lw });
      } else if (handle.shape === 'rotate') {
        const r = hs / 2;
        if (frame) {
          const top = this.framePoint(frame, 0, -frame.height / 2);
          const tip = this.framePoint(frame, 0, -frame.height / 2 - ROTATE_OFFSET_SCREEN / this.viewScale + r);
          g.moveTo(top.x, top.y).lineTo(tip.x, tip.y).stroke({ color, width: lw, alpha: 0.6 });
        } else {
          g.moveTo(handle.x, aabb.minY)
            .lineTo(handle.x, handle.y + r)
            .stroke({ color, width: lw, alpha: 0.6 });
        }
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
