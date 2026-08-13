import { Graphics } from 'pixi.js';
import { PlaceableObject, type CanvasLike } from './PlaceableObject';
import { CONFIG } from '../config';
import { flattenSegment } from '../geometry';
import type { WallData, WallSegmentData } from '../schemas';

function strokeDashed(shape: Graphics, seg: WallSegmentData, dash: number, gap: number, style: { color: number; width: number; alpha: number }): void {
  const points = flattenSegment(seg, seg.curve === 'linear' ? 1 : 24);
  let draw = true;
  let remaining = dash;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    let consumed = 0;
    while (consumed < length) {
      const step = Math.min(remaining, length - consumed);
      const t0 = consumed / length;
      const t1 = (consumed + step) / length;
      const p0 = { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 };
      const p1 = { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 };
      if (draw) shape.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y);
      consumed += step;
      remaining -= step;
      if (remaining <= 0) {
        draw = !draw;
        remaining = draw ? dash : gap;
      }
    }
  }
  shape.stroke(style);
}

export class Wall extends PlaceableObject<WallData> {
  readonly objectType = 'wall';
  private readonly shape = new Graphics();

  constructor(document: WallData & { id?: string }, canvas: CanvasLike) {
    super(document, canvas, { interactive: true });
    this.shape.eventMode = 'none';
    this.content.addChild(this.shape);
  }

  get segments(): WallSegmentData[] {
    return this.document.segments ?? [];
  }

  get bounds() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of this.segments) {
      minX = Math.min(minX, s.x1, s.x2, s.cp1x ?? s.x1, s.cp2x ?? s.x2);
      minY = Math.min(minY, s.y1, s.y2, s.cp1y ?? s.y1, s.cp2y ?? s.y2);
      maxX = Math.max(maxX, s.x1, s.x2, s.cp1x ?? s.x1, s.cp2x ?? s.x2);
      maxY = Math.max(maxY, s.y1, s.y2, s.cp1y ?? s.y1, s.cp2y ?? s.y2);
    }
    if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
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

  override refresh(): void {
    this.shape.clear();
    for (const segment of this.segments) {
      const isDoor = segment.door ?? false;
      const isSecret = isDoor && (segment.secret ?? false);
      const isOpen = isDoor && (segment.doorOpen ?? false);
      const color = isSecret ? CONFIG.wall.secretColor : isDoor ? CONFIG.wall.doorColor : CONFIG.wall.color;
      const alpha = isOpen ? 0.35 : 0.9;
      if (isSecret) {
        strokeDashed(this.shape, segment, 10, 6, { color, width: CONFIG.wall.width, alpha });
      } else {
        const curve = segment.curve ?? 'linear';
        this.shape.moveTo(segment.x1, segment.y1);
        if (curve === 'quadratic' && segment.cp1x !== undefined && segment.cp1y !== undefined) {
          this.shape.quadraticCurveTo(segment.cp1x, segment.cp1y, segment.x2, segment.y2);
        } else if (curve === 'cubic' && segment.cp1x !== undefined && segment.cp1y !== undefined && segment.cp2x !== undefined && segment.cp2y !== undefined) {
          this.shape.bezierCurveTo(segment.cp1x, segment.cp1y, segment.cp2x, segment.cp2y, segment.x2, segment.y2);
        } else {
          this.shape.lineTo(segment.x2, segment.y2);
        }
        this.shape.stroke({ color, width: CONFIG.wall.width, alpha });
      }
      if (isOpen) {
        // folha da porta aberta: perpendicular ao batente a partir da dobradiça (x1,y1)
        const dx = segment.x2 - segment.x1;
        const dy = segment.y2 - segment.y1;
        this.shape
          .moveTo(segment.x1, segment.y1)
          .lineTo(segment.x1 - dy, segment.y1 + dx)
          .stroke({ color, width: Math.max(2, CONFIG.wall.width - 1), alpha: 0.9 });
      }
      this.shape.circle(segment.x1, segment.y1, 3).fill({ color });
      this.shape.circle(segment.x2, segment.y2, 3).fill({ color });
    }
    this.refreshSelection();
  }

  protected override loadAssets(): Promise<void> {
    return Promise.resolve();
  }
}
