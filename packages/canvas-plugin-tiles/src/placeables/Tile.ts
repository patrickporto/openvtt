import { Graphics, Sprite } from 'pixi.js';
import { PlaceableObject, type CanvasLike } from '@openvtt/canvas';
import type { TileData } from '../schemas';

export class Tile extends PlaceableObject<TileData> {
  readonly objectType = 'tile';
  private baseWidth = 0;
  private baseHeight = 0;

  constructor(document: TileData, canvas: CanvasLike) {
    super(document, canvas, { interactive: true });
  }

  get width(): number {
    return this.document.width;
  }
  get height(): number {
    return this.document.height;
  }

  get bounds() {
    return { x: 0, y: 0, width: this.width, height: this.height };
  }

  protected override async loadAssets(): Promise<void> {
    this.content.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.content.scale.set(1, 1);
    this.baseWidth = this.width;
    this.baseHeight = this.height;
    const texture = await this.loadTexture(this.document.texture);
    if (texture) {
      const sprite = new Sprite(texture);
      sprite.width = this.width;
      sprite.height = this.height;
      this.content.addChild(sprite);
    } else {
      const rect = new Graphics();
      rect.rect(0, 0, this.width, this.height).fill({ color: 0x8a8a8a, alpha: 0.5 });
      this.content.addChild(rect);
    }
    this.alpha = this.document.alpha ?? 1;
    this.rotation = this.document.rotation ?? 0;
    this.zIndex = this.document.zIndex ?? 0;
  }

  override refresh(): void {
    const bw = this.baseWidth || this.width || 1;
    const bh = this.baseHeight || this.height || 1;
    this.content.scale.set(this.width / bw, this.height / bh);
    this.alpha = this.document.alpha ?? 1;
    this.rotation = this.document.rotation ?? 0;
    this.zIndex = this.document.zIndex ?? 0;
    this.refreshSelection();
  }
}
