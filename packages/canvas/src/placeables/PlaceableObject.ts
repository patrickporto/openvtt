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

/** Retângulo orientado (mundo) da seleção: gira junto com o placeable. */
export interface SelectionFrame {
  cx: number;
  cy: number;
  width: number;
  height: number;
  angle: number;
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
    const r = this.rotation || 0;
    if (r === 0) {
      return {
        minX: this.position.x + b.x,
        minY: this.position.y + b.y,
        maxX: this.position.x + b.x + b.width,
        maxY: this.position.y + b.y + b.height,
      };
    }
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    const corners: Array<[number, number]> = [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x, b.y + b.height],
      [b.x + b.width, b.y + b.height],
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [lx, ly] of corners) {
      const wx = this.position.x + lx * cos - ly * sin;
      const wy = this.position.y + lx * sin + ly * cos;
      if (wx < minX) minX = wx;
      if (wx > maxX) maxX = wx;
      if (wy < minY) minY = wy;
      if (wy > maxY) maxY = wy;
    }
    return { minX, minY, maxX, maxY };
  }

  /**
   * Caixa de seleção orientada: o retângulo apertado dos bounds locais
   * girado pelo ângulo do placeable. O pivô da rotação é a origem local
   * (position), então o centro do bounds é rotacionado junto — placeables
   * centrados (tokens) e ancorados no canto (retângulos, tiles) ficam
   * corretos. Placeables cuja rotação vive em outro campo (ex.:
   * 'direction') sobrescrevem para reportar o ângulo correto.
   */
  getSelectionFrame(): SelectionFrame {
    const b = this.bounds;
    const r = this.rotation || 0;
    const lx = b.x + b.width / 2;
    const ly = b.y + b.height / 2;
    if (r === 0) {
      return { cx: this.position.x + lx, cy: this.position.y + ly, width: b.width, height: b.height, angle: 0 };
    }
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    return {
      cx: this.position.x + lx * cos - ly * sin,
      cy: this.position.y + lx * sin + ly * cos,
      width: b.width,
      height: b.height,
      angle: r,
    };
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
