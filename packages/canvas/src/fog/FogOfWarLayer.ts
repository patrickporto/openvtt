import { Container, Graphics, RenderTexture, Sprite, Texture } from 'pixi.js';
import { CanvasLayer } from '../layers/CanvasLayer';
import type { Canvas } from '../canvas';
import type { Point } from '../input/types';
import { flattenSegment } from '../geometry';
import { computeVisibilityPolygon, type VisionSegment } from './visibility';

const FOG_COLOR = '#060608';
const GM_VIEW_ALPHA = 0.5;
const EXPLORED_DIM = 0.55;

/**
 * Fog of war estilo Foundry/Simple Fog:
 * - visão de tokens (polígono por raycasting contra walls com `sight`) revela
 *   a cena; áreas já vistas ficam em penumbra (explored);
 * - pintura manual (paint/reveal) para controle total do GM;
 * - GM view mostra o fog translúcido; player view mostra o fog opaco.
 *
 * Implementação: `explored` acumula num RenderTexture do pixi (normal blend);
 * a composição final é feita num Canvas2D offscreen com `destination-out`
 * (determinístico) e enviada a um sprite via Texture compartilhada.
 */
export class FogOfWarLayer extends CanvasLayer {
  private readonly canvas: Canvas;
  private exploredRT: RenderTexture | null = null;
  private manualCanvas: HTMLCanvasElement | null = null;
  private manualCtx: CanvasRenderingContext2D | null = null;
  private fogCanvas: HTMLCanvasElement | null = null;
  private fogCtx: CanvasRenderingContext2D | null = null;
  private fogTexture: Texture | null = null;
  private fogSprite: Sprite | null = null;
  private exploredCache: HTMLCanvasElement | null = null;
  private exploredDirty = true;
  private readonly clearer = new Container();
  private sceneWidth = 0;
  private sceneHeight = 0;
  private _enabled = false;
  private _darkness = 0.92;
  private _playerView = false;
  private unsubs: Array<() => void> = [];

  constructor(canvas: Canvas) {
    super({ name: 'fog', zIndex: 4000, interactive: false });
    this.canvas = canvas;
    this.visible = false;
  }

  get enabled(): boolean {
    return this._enabled;
  }
  get darkness(): number {
    return this._darkness;
  }
  get playerView(): boolean {
    return this._playerView;
  }

  /** Liga os gatilhos de recomputação (chamado uma vez em Canvas.initialize). */
  attach(): void {
    const bus = this.canvas.bus;
    const refresh = () => this.refresh();
    this.unsubs.push(
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
    this.visible = enabled;
    if (this.canvas.layers?.get('fog')) this.canvas.layers.setVisible('fog', enabled);
    if (enabled) this.refresh();
    this.emitChange();
  }

  setDarkness(darkness: number): void {
    this._darkness = Math.min(1, Math.max(0, darkness));
    this.compose();
    this.emitChange();
  }

  setPlayerView(playerView: boolean): void {
    this._playerView = playerView;
    this.applyViewAlpha();
    this.emitChange();
  }

  /** (Re)cria as texturas para o tamanho da cena e zera a exploração. */
  setup(width: number, height: number): void {
    this.destroyTextures();
    this.sceneWidth = Math.max(1, Math.round(width));
    this.sceneHeight = Math.max(1, Math.round(height));
    this.exploredRT = RenderTexture.create({ width: this.sceneWidth, height: this.sceneHeight });
    this.clearTexture(this.exploredRT);
    this.exploredCache = null;
    this.exploredDirty = true;

    this.manualCanvas = document.createElement('canvas');
    this.manualCanvas.width = this.sceneWidth;
    this.manualCanvas.height = this.sceneHeight;
    this.manualCtx = this.manualCanvas.getContext('2d')!;

    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = this.sceneWidth;
    this.fogCanvas.height = this.sceneHeight;
    this.fogCtx = this.fogCanvas.getContext('2d')!;

    this.fogTexture = Texture.from(this.fogCanvas);
    this.fogSprite = new Sprite(this.fogTexture);
    this.fogSprite.eventMode = 'none';
    this.addChild(this.fogSprite);
    this.applyViewAlpha();
    if (this._enabled) this.refresh();
    else this.compose();
  }

  /** Recomputa a visão atual: acumula no explored e recompõe o fog. */
  refresh(): void {
    if (!this._enabled || !this.exploredRT) return;
    const vision = this.buildVisionGraphics();
    if (vision) {
      this.canvas.app.renderer.render({ container: vision, target: this.exploredRT, clear: false });
      vision.destroy();
      this.exploredDirty = true;
    }
    this.compose();
  }

  /** Pinta nevoeiro manualmente (Simple Fog). */
  paintFog(x: number, y: number, radius: number): void {
    if (!this._enabled || !this.manualCtx) return;
    const ctx = this.manualCtx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = this._darkness;
    ctx.fillStyle = FOG_COLOR;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    this.compose();
  }

  /** Revela nevoeiro manualmente: remove pintura manual e marca como explorado. */
  revealFog(x: number, y: number, radius: number): void {
    if (!this._enabled || !this.manualCtx || !this.exploredRT) return;
    const ctx = this.manualCtx;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    const stamp = new Graphics().circle(x, y, radius).fill({ color: 0xffffff, alpha: 1 });
    this.canvas.app.renderer.render({ container: stamp, target: this.exploredRT, clear: false });
    stamp.destroy();
    this.exploredDirty = true;
    this.compose();
  }

  /** Zera exploração e pintura manual; a visão atual é revelada novamente. */
  reset(): void {
    if (!this.exploredRT || !this.manualCtx) return;
    this.clearTexture(this.exploredRT);
    this.exploredDirty = true;
    this.manualCtx.clearRect(0, 0, this.sceneWidth, this.sceneHeight);
    if (this._enabled) this.refresh();
    else this.compose();
  }

  private applyViewAlpha(): void {
    if (this.fogSprite) this.fogSprite.alpha = this._playerView ? 1 : GM_VIEW_ALPHA;
  }

  private visionSegments(): VisionSegment[] {
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

  private visionSources(): { origin: Point; radius: number }[] {
    const cell = this.canvas.grid.size;
    const sources: { origin: Point; radius: number }[] = [];
    for (const token of this.canvas.tokens.placeables) {
      const doc = token.document;
      if (doc.hidden) continue;
      const radius = (doc.visionRadius ?? 0) * cell;
      if (radius <= 0) continue;
      sources.push({ origin: { x: token.x, y: token.y }, radius });
    }
    return sources;
  }

  private visionPolygons(): Point[][] {
    const sources = this.visionSources();
    if (sources.length === 0) return [];
    const segments = this.visionSegments();
    const polygons: Point[][] = [];
    for (const source of sources) {
      const polygon = computeVisibilityPolygon(source.origin, source.radius, segments);
      if (polygon.length >= 3) polygons.push(polygon);
    }
    return polygons;
  }

  private buildVisionGraphics(): Graphics | null {
    const polygons = this.visionPolygons();
    if (polygons.length === 0) return null;
    const g = new Graphics();
    for (const polygon of polygons) {
      g.poly(polygon.flatMap((p) => [p.x, p.y])).fill({ color: 0xffffff, alpha: 1 });
    }
    return g;
  }

  /** Recompõe a textura final do fog (leve: usa cache do explored). Pública para visão ao vivo durante drags. */
  compose(): void {
    if (!this.fogCtx || !this.fogTexture) return;
    const ctx = this.fogCtx;

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = this._darkness;
    ctx.fillStyle = FOG_COLOR;
    ctx.fillRect(0, 0, this.sceneWidth, this.sceneHeight);

    if (this.exploredRT) {
      if (this.exploredDirty || !this.exploredCache) {
        this.exploredCache = this.canvas.app.renderer.extract.canvas(this.exploredRT) as HTMLCanvasElement;
        this.exploredDirty = false;
      }
      ctx.globalAlpha = EXPLORED_DIM;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(this.exploredCache, 0, 0);
    }

    if (this._enabled) {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'destination-out';
      for (const polygon of this.visionPolygons()) {
        ctx.beginPath();
        ctx.moveTo(polygon[0].x, polygon[0].y);
        for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i].x, polygon[i].y);
        ctx.closePath();
        ctx.fill();
      }
    }

    if (this.manualCanvas) {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(this.manualCanvas, 0, 0);
    }

    ctx.globalAlpha = 1;
    this.fogTexture.source.update();
  }

  private clearTexture(target: RenderTexture): void {
    this.canvas.app.renderer.render({ container: this.clearer, target, clear: true });
  }

  private destroyTextures(): void {
    this.fogSprite?.destroy();
    this.fogTexture?.destroy(true);
    this.exploredRT?.destroy(true);
    this.fogSprite = null;
    this.fogTexture = null;
    this.exploredRT = null;
    this.exploredCache = null;
    this.exploredDirty = true;
    this.manualCanvas = null;
    this.manualCtx = null;
    this.fogCanvas = null;
    this.fogCtx = null;
  }

  private emitChange(): void {
    this.canvas.bus.emit('fog:change', {
      enabled: this._enabled,
      darkness: this._darkness,
      playerView: this._playerView,
    });
  }

  override async tearDown(): Promise<void> {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    this.destroyTextures();
  }
}
