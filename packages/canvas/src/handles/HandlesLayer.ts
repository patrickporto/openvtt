import { Graphics } from 'pixi.js';
import { CanvasLayer } from '../layers/CanvasLayer';
import { CONFIG } from '../config';
import type { Canvas } from '../canvas';
import type { PlaceableObject } from '../placeables/PlaceableObject';
import type { Point } from '../input/types';
import { wallPointRoles, type WallPointRole } from '../layers/WallsLayer';

export type HandleCorner = 'tl' | 'tr' | 'bl' | 'br';
export type HandleInfo =
  | { type: 'resize'; corner: HandleCorner }
  | { type: 'rotate' }
  | { type: 'wall-point'; wallId: string; segmentIndex: number; role: WallPointRole };

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const HANDLE_SCREEN = 10;
const HIT_PAD_SCREEN = 4;
const ROTATE_OFFSET_SCREEN = 26;

export function isTransformable(obj: PlaceableObject): boolean {
  if (obj.objectType === 'token' || obj.objectType === 'tile') return true;
  if (obj.objectType === 'drawing') {
    const type = (obj.document as { type?: string }).type;
    return type === 'rect' || type === 'ellipse';
  }
  return false;
}

/**
 * Camada de handles da seleção: caixa delimitadora, cantos de resize e handle
 * de rotação. Desenhada em espaço de mundo, com tamanho contra-escalado pelo
 * zoom para parecer constante na tela. Nunca interativa — o hit-test dos
 * handles é feito pela SelectTool via `pickHandle`.
 */
export class HandlesLayer extends CanvasLayer {
  private readonly canvas: Canvas;
  readonly graphics = new Graphics();

  constructor(canvas: Canvas) {
    super({ name: 'handles', zIndex: 6000, interactive: false });
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
    return objects.length > 0 && objects.every(isTransformable);
  }

  handles(): { info: HandleInfo; x: number; y: number }[] {
    const aabb = this.getAABB();
    if (!aabb || !this.transformable) return [];
    const cx = (aabb.minX + aabb.maxX) / 2;
    const rotY = aabb.minY - ROTATE_OFFSET_SCREEN / this.viewScale;
    return [
      { info: { type: 'resize', corner: 'tl' }, x: aabb.minX, y: aabb.minY },
      { info: { type: 'resize', corner: 'tr' }, x: aabb.maxX, y: aabb.minY },
      { info: { type: 'resize', corner: 'bl' }, x: aabb.minX, y: aabb.maxY },
      { info: { type: 'resize', corner: 'br' }, x: aabb.maxX, y: aabb.maxY },
      { info: { type: 'rotate' }, x: cx, y: rotY },
    ];
  }

  /** Endpoints e pontos de controle das walls selecionadas. */
  wallPointHandles(): { info: HandleInfo & { type: 'wall-point' }; x: number; y: number }[] {
    const result: { info: HandleInfo & { type: 'wall-point' }; x: number; y: number }[] = [];
    for (const obj of this.canvas.selected) {
      if (obj.objectType !== 'wall') continue;
      const wall = this.canvas.walls.get(obj.id);
      if (!wall) continue;
      wall.segments.forEach((seg, segmentIndex) => {
        for (const role of wallPointRoles(seg)) {
          const x = role === 'p1' ? seg.x1 : role === 'p2' ? seg.x2 : role === 'cp1' ? (seg.cp1x ?? seg.x1) : (seg.cp2x ?? seg.x2);
          const y = role === 'p1' ? seg.y1 : role === 'p2' ? seg.y2 : role === 'cp1' ? (seg.cp1y ?? seg.y1) : (seg.cp2y ?? seg.y2);
          result.push({ info: { type: 'wall-point', wallId: wall.id, segmentIndex, role }, x, y });
        }
      });
    }
    return result;
  }

  pickHandle(point: Point): HandleInfo | null {
    if (this.canvas.interactionDisabled) return null;
    if (this.canvas.getCurrentToolId() !== 'select') return null;
    const tol = (HANDLE_SCREEN / 2 + HIT_PAD_SCREEN) / this.viewScale;
    for (const handle of this.wallPointHandles()) {
      if (Math.abs(point.x - handle.x) <= tol && Math.abs(point.y - handle.y) <= tol) return handle.info;
    }
    for (const handle of this.handles()) {
      if (handle.info.type === 'rotate') {
        const dx = point.x - handle.x;
        const dy = point.y - handle.y;
        if (dx * dx + dy * dy <= tol * tol) return handle.info;
      } else if (Math.abs(point.x - handle.x) <= tol && Math.abs(point.y - handle.y) <= tol) {
        return handle.info;
      }
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
    g.rect(aabb.minX, aabb.minY, aabb.maxX - aabb.minX, aabb.maxY - aabb.minY).stroke({
      color,
      width: lw,
      alpha: 0.9,
    });
    this.refreshWallPoints();
    if (!this.transformable) return;
    const hs = HANDLE_SCREEN / this.viewScale;
    for (const handle of this.handles()) {
      if (handle.info.type === 'resize') {
        g.rect(handle.x - hs / 2, handle.y - hs / 2, hs, hs)
          .fill(0xffffff)
          .stroke({ color, width: lw });
      } else {
        const r = hs / 2;
        g.moveTo(handle.x, aabb.minY)
          .lineTo(handle.x, handle.y + r)
          .stroke({ color, width: lw, alpha: 0.6 });
        g.circle(handle.x, handle.y, r)
          .fill(0xffffff)
          .stroke({ color, width: lw });
      }
    }
  }

  private refreshWallPoints(): void {
    const g = this.graphics;
    const color = CONFIG.selection.color;
    const lw = 1.5 / this.viewScale;
    const hs = HANDLE_SCREEN / this.viewScale;
    for (const handle of this.wallPointHandles()) {
      if (handle.info.role === 'p1' || handle.info.role === 'p2') {
        g.circle(handle.x, handle.y, hs / 2)
          .fill(0xffffff)
          .stroke({ color, width: lw });
      } else {
        g.rect(handle.x - hs / 2, handle.y - hs / 2, hs, hs)
          .fill({ color: 0x1a1610, alpha: 0.9 })
          .stroke({ color: 0xf0c168, width: lw });
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
