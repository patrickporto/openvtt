import { Graphics, Sprite, Text } from 'pixi.js';
import { PlaceableObject, type CanvasLike } from './PlaceableObject';
import { CONFIG } from '../config';
import { toHex } from '../utils';
import type { TokenData } from '../schemas';

export class Token extends PlaceableObject<TokenData> {
  readonly objectType = 'token';
  private baseSize = 0;

  constructor(document: TokenData & { id?: string }, canvas: CanvasLike) {
    super(document, canvas, { interactive: true });
  }

  get size(): number {
    return (this.document.size ?? 1) * this.canvas.grid.size;
  }

  get bounds() {
    const s = this.size;
    return { x: -s / 2, y: -s / 2, width: s, height: s };
  }

  override get x(): number {
    return this.position.x;
  }
  override set x(value: number) {
    this.position.x = value;
  }
  override get y(): number {
    return this.position.y;
  }
  override set y(value: number) {
    this.position.y = value;
  }

  protected override async loadAssets(): Promise<void> {
    this.content.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.content.scale.set(1, 1);
    const s = this.size;
    this.baseSize = s;
    const texture = await this.loadTexture(this.document.texture);
    if (texture) {
      const sprite = new Sprite(texture);
      sprite.width = s;
      sprite.height = s;
      const mask = new Graphics();
      mask.circle(s / 2, s / 2, s / 2).fill(0xffffff);
      sprite.mask = mask;
      const tint = this.document.tint;
      if (tint !== undefined) sprite.tint = toHex(tint);
      this.content.addChild(mask, sprite);
    } else {
      const circle = new Graphics();
      circle.circle(s / 2, s / 2, s / 2).fill({ color: CONFIG.token.fallbackColor, alpha: CONFIG.token.alpha });
      this.content.addChild(circle);
    }
    if (this.document.label) {
      const label = new Text({
        text: this.document.label,
        style: { fontSize: Math.max(10, s / 4), fill: 0xffffff, fontFamily: 'system-ui, sans-serif' },
      });
      label.anchor.set(0.5, 1);
      label.position.set(s / 2, s + 4);
      this.content.addChild(label);
    }
    this.rotation = this.document.rotation ?? 0;
    this.visible = !(this.document.hidden ?? false);
  }

  override refresh(): void {
    const s = this.size;
    const base = this.baseSize || s || 1;
    this.rotation = this.document.rotation ?? 0;
    this.visible = !(this.document.hidden ?? false);
    this.content.scale.set(s / base, s / base);
    this.content.position.set(-s / 2, -s / 2);
    this.refreshSelection();
  }

  moveTo(x: number, y: number): void {
    this.position.set(x, y);
    this.canvas.bus.emit('token:moved', { id: this.id, x, y });
  }
}
