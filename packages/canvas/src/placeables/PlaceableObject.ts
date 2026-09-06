import { Assets, Container, Texture } from 'pixi.js';
import { GlowFilter } from 'pixi-filters/glow';
import { CONFIG } from '../config';
import type { CanvasBus } from '../bus';
import type { GridConfig } from '../config';
import { toHex } from '../utils';

/** Subset de CanvasAnimation usado por placeables (moveTo animado). */
export interface CanvasAnimationLike {
  animate(options: {
    name?: string;
    duration: number;
    ease?: (t: number) => number;
    onUpdate: (progress: number, eased: number) => void;
    onComplete?: () => void;
  }): string;
  cancel(name: string): void;
}

export interface CanvasLike {
  readonly bus: CanvasBus;
  readonly grid: GridConfig;
  readonly selection: Set<string>;
  readonly animation?: CanvasAnimationLike;
}

export interface PlaceableObjectOptions {
  interactive?: boolean;
}

/**
 * Objeto posicionável "burro": não trata input nem se move sozinho. A camada de
 * interação (tools) é responsável por selecionar, arrastar e posicionar.
 */
export abstract class PlaceableObject<D = Record<string, unknown>> extends Container {
  abstract readonly objectType: string;
  id: string;
  document: D;
  protected readonly canvas: CanvasLike;
  protected readonly content: Container;
  protected options: PlaceableObjectOptions;
  private loaded = false;

  constructor(
    document: D & { id?: string; x?: number; y?: number; rotation?: number },
    canvas: CanvasLike,
    options: PlaceableObjectOptions = {},
  ) {
    super();
    this.document = document;
    this.id = document.id ?? '';
    this.canvas = canvas;
    this.options = options;
    this.position.set(document.x ?? 0, document.y ?? 0);
    this.rotation = document.rotation ?? 0;
    this.content = new Container();
    this.content.label = 'content';
    this.addChild(this.content);
    this.eventMode = 'none';
  }

  get isSelectable(): boolean {
    return this.options.interactive !== false;
  }

  /** Trancado: não-interativo nas tools (sem pick, drag, resize, rotação nem delete). */
  get isLocked(): boolean {
    return (this.document as { locked?: boolean }).locked === true;
  }

  get x(): number {
    return this.position.x;
  }
  set x(value: number) {
    this.position.x = value;
  }
  get y(): number {
    return this.position.y;
  }
  set y(value: number) {
    this.position.y = value;
  }

  abstract get bounds(): { x: number; y: number; width: number; height: number };

  getAABB(): { minX: number; minY: number; maxX: number; maxY: number } {
    const b = this.bounds;
    const cx = this.position.x + b.x + b.width / 2;
    const cy = this.position.y + b.y + b.height / 2;
    const hw = b.width / 2;
    const hh = b.height / 2;
    const r = this.rotation || 0;
    if (r === 0) {
      return { minX: cx - hw, minY: cy - hh, maxX: cx + hw, maxY: cy + hh };
    }
    const cos = Math.abs(Math.cos(r));
    const sin = Math.abs(Math.sin(r));
    const ow = hw * cos + hh * sin;
    const oh = hw * sin + hh * cos;
    return { minX: cx - ow, minY: cy - oh, maxX: cx + ow, maxY: cy + oh };
  }

  async draw(): Promise<this> {
    this.label = this.objectType;
    this.loaded = false;
    await this.loadAssets();
    this.loaded = true;
    this.refresh();
    return this;
  }

  protected async loadAssets(): Promise<void> {}

  abstract refresh(): void;

  protected refreshSelection(): void {
    const selected = this.canvas.selection.has(this.id);
    if (selected && !this.filters) {
      this.filters = [
        new GlowFilter({
          color: CONFIG.selection.color,
          outerStrength: 2,
          innerStrength: 0,
          alpha: CONFIG.selection.alpha,
          distance: CONFIG.selection.width,
        }),
      ];
    } else if (!selected && this.filters) {
      this.filters = null;
    }
  }

  update(changes: Partial<D>): void {
    Object.assign(this.document as Record<string, unknown>, changes as Record<string, unknown>);
    const doc = this.document as { id?: string; x?: number; y?: number; rotation?: number };
    if (typeof doc.id === 'string') this.id = doc.id;
    if (typeof doc.x === 'number' && typeof doc.y === 'number') this.position.set(doc.x, doc.y);
    if (typeof doc.rotation === 'number') this.rotation = doc.rotation;
    this.refresh();
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  protected async loadTexture(src?: string): Promise<Texture | null> {
    if (!src) return null;
    try {
      return await Assets.load(src);
    } catch {
      return null;
    }
  }

  protected asHex(color?: number | string, fallback = 0xffffff): number {
    if (color === undefined) return fallback;
    return toHex(color);
  }
}
