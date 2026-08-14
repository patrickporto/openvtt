import { Container, Graphics, RenderTexture, Sprite, Texture } from 'pixi.js';
import { CanvasLayer, dynamicBus, type Canvas, type Point } from '@openvtt/canvas';
import { computeVisibilityPolygon, type VisionSegment } from './visibility';

const FOG_COLOR = '#060608';
const GM_VIEW_ALPHA = 0.5;
const EXPLORED_DIM = 0.55;

/**
 * Fog of war estilo Foundry/Simple Fog:
 * - visão (polígono por raycasting contra os segmentos de `sight:segments`)
 *   revela a cena; áreas já vistas ficam em penumbra (explored);
 * - pintura manual (paint/reveal) para controle total do GM;
 * - GM view mostra o fog translúcido; player view mostra o fog opaco.
 *
 * As fontes de visão e os bloqueios vêm dos hooks `vision:sources` e
 * `sight:segments` do bus do canvas, contribuídos por outros plugins.
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

  setEnabled(enabled: boolean): void {
    if (this._enabled === enabled) return;
    this._enabled = enabled;
    this.visible = enabled;
    this.canvas.layers.setVisible('fog', enabled);
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
    const { segments } = this.canvas.bus.call('sight:segments', { segments: [] });
    return segments.map((seg) => ({ x1: seg.a.x, y1: seg.a.y, x2: seg.b.x, y2: seg.b.y }));
  }

  private visionSources(): { origin: Point; radius: number }[] {
    const { sources } = this.canvas.bus.call('vision:sources', { sources: [] });
    return sources.map((source) => ({ origin: { x: source.x, y: source.y }, radius: source.radius }));
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
    dynamicBus(this.canvas.bus).emit('fog:change', {
      enabled: this._enabled,
      darkness: this._darkness,
      playerView: this._playerView,
    });
  }

  override async tearDown(): Promise<void> {
    this.destroyTextures();
  }
}
