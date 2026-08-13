import { Graphics, Sprite, Texture } from 'pixi.js';
import { CanvasLayer } from '../layers/CanvasLayer';
import type { Canvas } from '../canvas';
import type { Point } from '../input/types';
import { computeVisibilityPolygon, type VisionSegment } from '../fog/visibility';
import { flattenSegment } from '../geometry';
import { toHex } from '../utils';

const NIGHT_COLOR = '#0a0a18';
const DIM_CUT = 0.65;

interface LightSource {
  origin: Point;
  brightRadius: number;
  dimRadius: number;
  color: number;
}

/**
 * Iluminação estilo Foundry: overlay de escuridão da cena recortado pelas
 * fontes de luz (luzes ambiente + tokens com lightDim/lightBright), com
 * oclusão por walls (mesmo raycasting do fog) e tinta colorida por luz.
 * Composição em Canvas2D (`destination-out` + `lighter`), determinística.
 */
export class LightingFxLayer extends CanvasLayer {
  private readonly canvas: Canvas;
  private fxCanvas: HTMLCanvasElement | null = null;
  private fxCtx: CanvasRenderingContext2D | null = null;
  private fxTexture: Texture | null = null;
  private fxSprite: Sprite | null = null;
  private sceneWidth = 0;
  private sceneHeight = 0;
  private _enabled = false;
  private _darkness = 0;
  private unsubs: Array<() => void> = [];

  constructor(canvas: Canvas) {
    super({ name: 'lighting', zIndex: 3900, interactive: false });
    this.canvas = canvas;
    this.visible = false;
  }

  get enabled(): boolean {
    return this._enabled;
  }
  get darkness(): number {
    return this._darkness;
  }

  attach(): void {
    const bus = this.canvas.bus;
    const refresh = () => this.compose();
    this.unsubs.push(
      bus.on('light:create', refresh),
      bus.on('light:update', refresh),
      bus.on('light:delete', refresh),
      bus.on('token:moved', refresh),
      bus.on('token:create', refresh),
      bus.on('token:update', refresh),
      bus.on('token:delete', refresh),
      bus.on('wall:create', refresh),
      bus.on('wall:update', refresh),
      bus.on('wall:delete', refresh),
    );
  }

  setEnabled(enabled: boolean): void {
    if (this._enabled === enabled) return;
    this._enabled = enabled;
    this.syncVisibility();
    this.compose();
    this.emitChange();
  }

  setDarkness(darkness: number): void {
    this._darkness = Math.min(1, Math.max(0, darkness));
    this.syncVisibility();
    this.compose();
    this.emitChange();
  }

  setup(width: number, height: number): void {
    this.destroyTextures();
    this.sceneWidth = Math.max(1, Math.round(width));
    this.sceneHeight = Math.max(1, Math.round(height));
    this.fxCanvas = document.createElement('canvas');
    this.fxCanvas.width = this.sceneWidth;
    this.fxCanvas.height = this.sceneHeight;
    this.fxCtx = this.fxCanvas.getContext('2d')!;
    this.fxTexture = Texture.from(this.fxCanvas);
    this.fxSprite = new Sprite(this.fxTexture);
    this.fxSprite.eventMode = 'none';
    this.addChild(this.fxSprite);
    this.syncVisibility();
    this.compose();
  }

  private syncVisibility(): void {
    this.visible = this._enabled && this._darkness > 0;
  }

  private wallSegments(): VisionSegment[] {
    const segments: VisionSegment[] = [];
    for (const wall of this.canvas.walls.placeables) {
      for (const seg of wall.segments) {
        if (seg.sight === false) continue;
        if (seg.door && seg.doorOpen) continue;
        if (seg.curve && seg.curve !== 'linear') {
          const points = flattenSegment(seg, 16);
          for (let i = 1; i < points.length; i++) {
            segments.push({ x1: points[i - 1].x, y1: points[i - 1].y, x2: points[i].x, y2: points[i].y });
          }
        } else {
          segments.push({ x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2 });
        }
      }
    }
    return segments;
  }

  private lightSources(): LightSource[] {
    const cell = this.canvas.grid.size;
    const sources: LightSource[] = [];
    for (const light of this.canvas.lights.placeables) {
      sources.push({
        origin: { x: light.x, y: light.y },
        brightRadius: light.brightRadius,
        dimRadius: light.dimRadius,
        color: light.color,
      });
    }
    for (const token of this.canvas.tokens.placeables) {
      const doc = token.document;
      if (doc.hidden) continue;
      const dim = (doc.lightDim ?? 0) * cell;
      if (dim <= 0) continue;
      sources.push({
        origin: { x: token.x, y: token.y },
        brightRadius: (doc.lightBright ?? 0) * cell,
        dimRadius: dim,
        color: 0xffd9a0,
      });
    }
    return sources.filter((s) => s.dimRadius > 0);
  }

  /** Recompõe a escuridão com os recortes de luz. Pública para atualização ao vivo em drags. */
  compose(): void {
    if (!this.fxCtx || !this.fxTexture) return;
    const ctx = this.fxCtx;
    ctx.clearRect(0, 0, this.sceneWidth, this.sceneHeight);
    if (!this._enabled || this._darkness <= 0) {
      this.fxTexture.source.update();
      return;
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = this._darkness;
    ctx.fillStyle = NIGHT_COLOR;
    ctx.fillRect(0, 0, this.sceneWidth, this.sceneHeight);

    const segments = this.wallSegments();
    const sources = this.lightSources();
    const polygons: { polygon: Point[]; source: LightSource }[] = [];
    for (const source of sources) {
      const polygon = computeVisibilityPolygon(source.origin, source.dimRadius, segments);
      if (polygon.length >= 3) polygons.push({ polygon, source });
    }

    for (const { polygon, source } of polygons) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = Math.min(1, this._darkness * DIM_CUT);
      this.tracePath(ctx, polygon);
      if (source.brightRadius > 0) {
        const bright = computeVisibilityPolygon(source.origin, source.brightRadius, segments);
        if (bright.length >= 3) {
          ctx.globalAlpha = this._darkness;
          this.tracePath(ctx, bright);
        }
      }
    }

    for (const { polygon, source } of polygons) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = `#${toHex(source.color).toString(16).padStart(6, '0')}`;
      this.tracePath(ctx, polygon);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.fxTexture.source.update();
  }

  private tracePath(ctx: CanvasRenderingContext2D, polygon: Point[]): void {
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i].x, polygon[i].y);
    ctx.closePath();
    ctx.fill();
  }

  private destroyTextures(): void {
    this.fxSprite?.destroy();
    this.fxTexture?.destroy(true);
    this.fxSprite = null;
    this.fxTexture = null;
    this.fxCanvas = null;
    this.fxCtx = null;
  }

  private emitChange(): void {
    this.canvas.bus.emit('lighting:change', { enabled: this._enabled, darkness: this._darkness });
  }

  override async tearDown(): Promise<void> {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    this.destroyTextures();
  }
}
