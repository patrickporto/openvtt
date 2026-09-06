import { Graphics } from 'pixi.js';
import { PlaceableObject, type CanvasLike } from '@openvtt/canvas';
import type { SoundData } from '../schemas';

const COLOR = 0x63e2b7;

export class AmbientSound extends PlaceableObject<SoundData> {
  readonly objectType = 'sound';
  private readonly shape = new Graphics();

  constructor(document: SoundData & { id?: string }, canvas: CanvasLike) {
    super(document, canvas, { interactive: true });
    this.shape.eventMode = 'none';
    this.content.addChild(this.shape);
  }

  get radiusPx(): number {
    return this.document.radius * this.canvas.grid.size;
  }

  get color(): number {
    return COLOR;
  }

  get bounds() {
    return { x: -20, y: -20, width: 40, height: 40 };
  }

  override refresh(): void {
    const g = this.shape;
    g.clear();
    const radius = this.radiusPx;
    g.circle(0, 0, radius).stroke({ color: COLOR, width: 2, alpha: 0.35 });
    g.circle(0, 0, radius).fill({ color: COLOR, alpha: 0.04 });
    g.circle(0, 0, 9).fill({ color: COLOR, alpha: this.document.playing ? 0.9 : 0.4 });
    g.arc(0, 0, 14, -Math.PI / 3, Math.PI / 3).stroke({ color: COLOR, width: 2, alpha: 0.7 });
    g.arc(0, 0, 18, -Math.PI / 3.5, Math.PI / 3.5).stroke({ color: COLOR, width: 2, alpha: 0.45 });
    this.refreshSelection();
  }

  protected override loadAssets(): Promise<void> {
    return Promise.resolve();
  }
}
