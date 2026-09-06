import { Graphics, Text } from 'pixi.js';
import { PlaceableObject, toHex, type CanvasLike } from '@openvtt/canvas';
import type { RollTableAnchorData } from '../schemas';

const SIZE = 44;
const FALLBACK_COLOR = 0x8e6ff7;
const MAX_RESULT_CHARS = 48;

export class RollTableAnchor extends PlaceableObject<RollTableAnchorData> {
  readonly objectType = 'roll-table';
  private readonly shape = new Graphics();
  private readonly labelText = new Text({ text: '', style: { fontSize: 11, fill: 0xffffff, fontFamily: 'sans-serif' } });
  private readonly resultText = new Text({ text: '', style: { fontSize: 10, fill: 0xd8d4ff, fontFamily: 'sans-serif' } });

  constructor(document: RollTableAnchorData & { id?: string }, canvas: CanvasLike) {
    super(document, canvas, { interactive: true });
    this.shape.eventMode = 'none';
    this.labelText.eventMode = 'none';
    this.resultText.eventMode = 'none';
    this.labelText.anchor.set(0.5, 0);
    this.resultText.anchor.set(0.5, 1);
    this.content.addChild(this.shape, this.labelText, this.resultText);
  }

  get color(): number {
    return toHex(this.document.color ?? FALLBACK_COLOR);
  }

  get bounds() {
    return { x: -SIZE / 2, y: -SIZE / 2, width: SIZE, height: SIZE };
  }

  override refresh(): void {
    const g = this.shape;
    const color = this.color;
    g.clear();
    g.roundRect(-SIZE / 2, -SIZE / 2, SIZE, SIZE, 8)
      .fill({ color: 0x1a1726, alpha: 0.92 })
      .stroke({ color, width: 2, alpha: 0.9 });
    g.circle(0, -8, 3).fill({ color, alpha: 0.95 });
    g.circle(-8, 2, 3).fill({ color, alpha: 0.95 });
    g.circle(8, 2, 3).fill({ color, alpha: 0.95 });
    g.circle(0, 12, 3).fill({ color, alpha: 0.95 });

    this.labelText.text = this.document.label ?? '';
    this.labelText.position.set(0, SIZE / 2 + 3);

    const last = this.document.lastResult ?? '';
    this.resultText.text = last.length > MAX_RESULT_CHARS ? `${last.slice(0, MAX_RESULT_CHARS)}…` : last;
    this.resultText.position.set(0, -SIZE / 2 - 4);

    this.refreshSelection();
  }

  protected override loadAssets(): Promise<void> {
    return Promise.resolve();
  }
}
