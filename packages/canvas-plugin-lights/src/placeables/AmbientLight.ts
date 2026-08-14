import { Graphics } from 'pixi.js';
import { PlaceableObject, toHex, type CanvasLike } from '@openvtt/canvas';
import type { LightData } from '../schemas';

export class AmbientLight extends PlaceableObject<LightData> {
  readonly objectType = 'light';
  private readonly shape = new Graphics();

  constructor(document: LightData & { id?: string }, canvas: CanvasLike) {
    super(document, canvas, { interactive: true });
    this.shape.eventMode = 'none';
    this.content.addChild(this.shape);
  }

  get dimRadius(): number {
    return this.document.dim * this.canvas.grid.size;
  }

  get brightRadius(): number {
    return (this.document.bright ?? 0) * this.canvas.grid.size;
  }

  get color(): number {
    return toHex(this.document.color ?? 0xffb35c);
  }

  get bounds() {
    const r = this.dimRadius;
    return { x: -r, y: -r, width: r * 2, height: r * 2 };
  }

  override refresh(): void {
    const g = this.shape;
    g.clear();
    const dim = this.dimRadius;
    const bright = this.brightRadius;
    const color = this.color;
    g.circle(0, 0, dim).fill({ color, alpha: 0.06 });
    if (bright > 0) g.circle(0, 0, bright).fill({ color, alpha: 0.08 });
    g.circle(0, 0, 10).fill({ color, alpha: 0.9 });
    g.circle(0, 0, 14).stroke({ color, width: 2, alpha: 0.7 });
    this.refreshSelection();
  }

  protected override loadAssets(): Promise<void> {
    return Promise.resolve();
  }
}
