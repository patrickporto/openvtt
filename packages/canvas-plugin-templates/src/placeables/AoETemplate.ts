import { Graphics, Text } from 'pixi.js';
import { PlaceableObject, toHex, type CanvasLike, type Point } from '@openvtt/canvas';
import type { TemplateData } from '../schemas';
import { bboxOf, conePoints, rayPoints } from '../templates/geometry';

export class AoETemplate extends PlaceableObject<TemplateData> {
  readonly objectType = 'template';
  private readonly shape = new Graphics();
  private readonly caption: Text;

  constructor(document: TemplateData & { id?: string }, canvas: CanvasLike) {
    super(document, canvas, { interactive: true });
    this.shape.eventMode = 'none';
    this.caption = new Text({
      text: '',
      style: { fontSize: 13, fill: 0xffffff, fontFamily: 'system-ui, sans-serif', fontWeight: '600', stroke: { color: 0x000000, width: 3 } },
    });
    this.caption.eventMode = 'none';
    this.content.addChild(this.shape, this.caption);
  }

  private get cell(): number {
    return this.canvas.grid.size;
  }

  get color(): number {
    return toHex(this.document.color ?? 0x4fc3f7);
  }

  private localPoints(): Point[] | null {
    const doc = this.document;
    const length = doc.distance * this.cell;
    if (doc.shape === 'cone') return conePoints({ x: 0, y: 0 }, doc.direction ?? 0, length);
    if (doc.shape === 'ray') return rayPoints({ x: 0, y: 0 }, doc.direction ?? 0, length, (doc.width ?? 1) * this.cell);
    return null;
  }

  get bounds() {
    const doc = this.document;
    const length = doc.distance * this.cell;
    if (doc.shape === 'circle') return { x: -length, y: -length, width: length * 2, height: length * 2 };
    const points = this.localPoints();
    if (!points) return { x: 0, y: 0, width: 0, height: 0 };
    return bboxOf(points);
  }

  override refresh(): void {
    const g = this.shape;
    g.clear();
    const doc = this.document;
    const length = doc.distance * this.cell;
    const color = this.color;
    const fillAlpha = doc.fillAlpha ?? 0.25;

    if (doc.shape === 'circle') {
      g.circle(0, 0, length).fill({ color, alpha: fillAlpha });
      g.circle(0, 0, length).stroke({ color, width: 2, alpha: 0.9 });
    } else {
      const points = this.localPoints();
      if (points) {
        g.poly(points.flatMap((p) => [p.x, p.y])).fill({ color, alpha: fillAlpha });
        g.poly(points.flatMap((p) => [p.x, p.y])).stroke({ color, width: 2, alpha: 0.9 });
      }
    }
    g.circle(0, 0, 4).fill({ color, alpha: 0.9 });

    const anchor = this.labelAnchor();
    this.caption.text = `${doc.distance} u`;
    this.caption.anchor.set(0.5, 1);
    this.caption.position.set(anchor.x, anchor.y - 6);
    this.refreshSelection();
  }

  private labelAnchor(): Point {
    const doc = this.document;
    const length = doc.distance * this.cell;
    if (doc.shape === 'circle') return { x: 0, y: -length };
    return { x: Math.cos(doc.direction ?? 0) * length, y: Math.sin(doc.direction ?? 0) * length };
  }

  protected override loadAssets(): Promise<void> {
    return Promise.resolve();
  }
}
