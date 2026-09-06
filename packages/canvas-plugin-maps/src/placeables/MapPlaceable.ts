import { Graphics } from 'pixi.js';
import { PlaceableObject, dynamicBus } from '@openvtt/canvas';
import type { CanvasLike } from '@openvtt/canvas';
import type { MapData } from '../schemas';
import type { MapSourceRegistry } from '../MapSourceRegistry';
import type { TiledSource } from '../tiled/TiledSource';
import { TiledSprite } from '../tiled/TiledSprite';

export class MapPlaceable extends PlaceableObject<MapData> {
  readonly objectType = 'map';
  private tiled: TiledSprite | null = null;
  private sourceRef: TiledSource | null = null;
  private natural: { width: number; height: number } | null = null;

  constructor(document: MapData, canvas: CanvasLike, private readonly registry: MapSourceRegistry) {
    super(document, canvas, { interactive: true });
  }

  get width(): number {
    return this.document.width ?? 0;
  }

  get height(): number {
    return this.document.height ?? 0;
  }

  get bounds() {
    return { x: 0, y: 0, width: this.width, height: this.height };
  }

  get src(): string {
    const source = this.document.source;
    return source.type === 'image' ? source.src : source.url;
  }

  /** Dimensões naturais da fonte (pixels da imagem/tiles), se carregada. */
  get naturalSize(): { width: number; height: number } | null {
    return this.natural;
  }

  protected override async loadAssets(): Promise<void> {
    this.content.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.tiled = null;
    const emit = (name: string, payload: Record<string, unknown>): void => {
      dynamicBus(this.canvas.bus).emit(name, payload);
    };
    const source = this.registry.acquire(this.document.source, {
      onProgress: (loaded, total) => emit('map:progress', { id: this.id, src: this.src, loaded, total }),
    });
    this.sourceRef = source;
    await source.ready;
    if (source.error || !source.baseWidth || !source.baseHeight) {
      this.registry.release(source);
      emit('map:error', {
        id: this.id,
        src: this.src,
        message: source.error?.message ?? 'invalid map source',
      });
      const placeholder = new Graphics();
      placeholder
        .rect(0, 0, Math.max(1, this.width), Math.max(1, this.height))
        .fill({ color: 0x2a2a35, alpha: 0.6 });
      this.content.addChild(placeholder);
      return;
    }
    const doc = this.document as { width?: number; height?: number };
    if (doc.width === undefined) doc.width = source.baseWidth;
    if (doc.height === undefined) doc.height = source.baseHeight;
    this.natural = { width: source.baseWidth, height: source.baseHeight };
    this.tiled = new TiledSprite(source, this.width, this.height);
    this.content.addChild(this.tiled);
    emit('map:loaded', {
      id: this.id,
      src: this.src,
      width: source.baseWidth,
      height: source.baseHeight,
      levels: source.maxLevel + 1,
    });
  }

  updateTiledView(view: { x: number; y: number; width: number; height: number }, scale: number): void {
    if (!this.tiled) return;
    this.tiled.updateView(
      { x: view.x - this.x, y: view.y - this.y, width: view.width, height: view.height },
      scale,
    );
  }

  override refresh(): void {
    if (this.tiled) {
      this.tiled.worldWidth = this.width;
      this.tiled.worldHeight = this.height;
      this.tiled.invalidate();
    }
    this.alpha = this.document.alpha ?? 1;
    this.refreshSelection();
  }

  override destroy(options?: Parameters<PlaceableObject['destroy']>[0]): void {
    this.tiled = null;
    if (this.sourceRef) {
      this.registry.release(this.sourceRef);
      this.sourceRef = null;
    }
    super.destroy(options);
  }
}
