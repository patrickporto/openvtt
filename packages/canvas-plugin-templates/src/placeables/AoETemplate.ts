import { Graphics, Text } from 'pixi.js';
import { GridRenderer, PlaceableObject, toHex, type CanvasLike, type Point, type SelectionFrame } from '@openvtt/canvas';
import type { TemplateData } from '../schemas';
import { bboxOf, conePoints, rayPoints } from '../templates/geometry';
import { affectedCells, footprintOf } from '../templates/cells';

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

  override getSelectionFrame(): SelectionFrame {
    const doc = this.document;
    const length = doc.distance * this.cell;
    if (doc.shape === 'circle') {
      return { cx: this.x, cy: this.y, width: length * 2, height: length * 2, angle: 0 };
    }
    const points = this.localPoints();
    if (!points) return super.getSelectionFrame();
    const direction = doc.direction ?? 0;
    const cos = Math.cos(direction);
    const sin = Math.sin(direction);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      const x = p.x * cos + p.y * sin;
      const y = -p.x * sin + p.y * cos;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const bx = (minX + maxX) / 2;
    const by = (minY + maxY) / 2;
    return {
      cx: this.x + bx * cos - by * sin,
      cy: this.y + bx * sin + by * cos,
      width: maxX - minX,
      height: maxY - minY,
      angle: direction,
    };
  }

  override refresh(): void {
    const g = this.shape;
    g.clear();
    const doc = this.document;
    const length = doc.distance * this.cell;
    const color = this.color;
    const fillAlpha = doc.fillAlpha ?? 0.25;

    this.drawAffectedCells(g, color);

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

  private drawAffectedCells(g: Graphics, color: number): void {
    const grid = this.canvas.grid;
    const size = grid.size;
    const px = this.position.x;
    const py = this.position.y;
    for (const center of affectedCells(footprintOf(this.document, size), grid)) {
      const cell = GridRenderer.getCellShape(center.x, center.y, grid.type, size, grid.offsetX ?? 0, grid.offsetY ?? 0);
      if (!cell) continue;
      if (cell.type === 'rect') {
        const [x, y, w, h] = cell.data;
        g.rect(x - px, y - py, w, h).fill({ color, alpha: 0.18 });
      } else {
        g.poly(cell.data.map((v, i) => v - (i % 2 === 0 ? px : py))).fill({ color, alpha: 0.18 });
      }
    }
  }

  protected override loadAssets(): Promise<void> {
    return Promise.resolve();
  }
}
