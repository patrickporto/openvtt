import { Assets, Graphics, Sprite } from 'pixi.js';
import { CanvasLayer, type CanvasLayerOptions } from './CanvasLayer';
import { toHex } from '../utils';

export interface BackgroundLayerOptions extends CanvasLayerOptions {
  backgroundColor?: number | string;
}

export class BackgroundLayer extends CanvasLayer {
  private sprite: Sprite | null = null;
  private solid: Graphics | null = null;
  private currentSource: string | null = null;
  backgroundColor: number;

  constructor(options: BackgroundLayerOptions) {
    super({ ...options, name: options.name ?? 'background', zIndex: options.zIndex ?? -1000 });
    this.backgroundColor = options.backgroundColor !== undefined ? toHex(options.backgroundColor) : 0x000000;
  }

  async setBackground(source?: string | null, backgroundColor?: number | string): Promise<void> {
    if (backgroundColor !== undefined) {
      this.backgroundColor = toHex(backgroundColor);
      this.clearSolid(this.backgroundColor);
    }
    if (source === this.currentSource) return;
    this.currentSource = source ?? null;
    this.sprite?.destroy({ children: true });
    this.sprite = null;
    if (!source) return;
    try {
      const texture = await Assets.load(source);
      const sprite = new Sprite(texture);
      sprite.label = 'background-image';
      this.sprite = sprite;
      this.addChild(sprite);
    } catch {
      this.sprite = null;
    }
  }

  private clearSolid(hex: number): void {
    if (this.solid) this.solid.clear();
    else {
      this.solid = new Graphics();
      this.addChildAt(this.solid, 0);
    }
    this.solid.rect(-100000, -100000, 200000, 200000).fill({ color: hex });
  }

  override async tearDown(): Promise<void> {
    this.sprite?.destroy({ children: true });
    this.solid?.destroy({ children: true });
    this.sprite = null;
    this.solid = null;
    this.currentSource = null;
    await super.tearDown();
  }
}
