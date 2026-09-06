import { Graphics, Text } from 'pixi.js';
import { CanvasLayer, type Canvas, type Point } from '@openvtt/canvas';
import type { ResolvedRing } from '../resolve';
import type { RangeShape } from '../schemas';

export interface DrawnRange {
  x: number;
  y: number;
  rings: readonly ResolvedRing[];
  emphasized: number | null;
  crosshair: boolean;
}

export interface RangeGuide {
  from: Point;
  to: Point;
  label: string;
}

export interface RangeRenderInput {
  shape: RangeShape;
  labels: boolean;
  fillAlpha: number;
  ranges: readonly DrawnRange[];
  guide: RangeGuide | null;
}

const EMPTY_INPUT: RangeRenderInput = { shape: 'circle', labels: false, fillAlpha: 0, ranges: [], guide: null };
const DIAGONAL = Math.SQRT1_2;

export class RangeOverlayLayer extends CanvasLayer {
  private readonly canvas: Canvas;
  private readonly g = new Graphics();
  private readonly labelPool: Text[] = [];
  private last: RangeRenderInput = EMPTY_INPUT;
  private viewScale = 1;
  private offZoom: (() => void) | null = null;
  private disposed = false;

  constructor(canvas: Canvas) {
    super({ name: 'ranges', interactive: false });
    this.canvas = canvas;
    this.g.eventMode = 'none';
    this.addChild(this.g);
    this.viewScale = canvas.viewport?.scale ?? 1;
    this.offZoom = canvas.bus.on('zoom', ({ scale }) => {
      this.viewScale = scale;
      this.paint();
    });
  }

  render(input: RangeRenderInput): void {
    this.last = input;
    this.paint();
  }

  dispose(): void {
    this.disposed = true;
    this.offZoom?.();
    this.offZoom = null;
    this.last = EMPTY_INPUT;
    this.labelPool.length = 0;
    if (!this.destroyed) this.g.clear();
  }

  private paint(): void {
    if (this.disposed || this.destroyed) return;
    const input = this.last;
    const g = this.g;
    g.clear();
    let labelIndex = 0;
    const cell = Math.max(1, this.canvas.grid.size);
    const s = 1 / this.viewScale;

    for (const range of input.ranges) {
      const ordered = [...range.rings].sort((a, b) => b.cells - a.cells);
      for (const ring of ordered) {
        const radius = ring.cells * cell;
        const active = range.emphasized !== null && Math.abs(ring.cells - range.emphasized) < 1e-6;
        this.trace(g, input.shape, range.x, range.y, radius);
        g.fill({ color: ring.color, alpha: Math.min(0.45, input.fillAlpha * (active ? 2.4 : ring.emphasis ? 1.6 : 1)) });
        this.trace(g, input.shape, range.x, range.y, radius);
        g.stroke({ color: ring.color, width: (active ? 3.2 : ring.emphasis ? 2.4 : 1.6) * s, alpha: active ? 1 : 0.85 });
        if (input.labels) {
          const anchor = this.ringAnchor(input.shape, range.x, range.y, radius);
          this.drawLabel(labelIndex++, ring.label, anchor.x, anchor.y, ring.color);
        }
      }
      if (range.crosshair) this.crosshair(g, range.x, range.y, s);
    }

    if (input.guide) {
      const { from, to, label } = input.guide;
      g.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color: 0xffffff, width: 1.4 * s, alpha: 0.85 });
      g.circle(to.x, to.y, 3.2 * s).fill({ color: 0xffffff, alpha: 0.95 });
      this.drawLabel(labelIndex++, label, to.x + 16 * s, to.y - 22 * s, 0xffffff);
    }

    for (let i = labelIndex; i < this.labelPool.length; i++) this.labelPool[i].visible = false;
  }

  private trace(g: Graphics, shape: RangeShape, x: number, y: number, radius: number): void {
    if (shape === 'square') g.rect(x - radius, y - radius, radius * 2, radius * 2);
    else g.circle(x, y, radius);
  }

  private ringAnchor(shape: RangeShape, x: number, y: number, radius: number): Point {
    if (shape === 'square') return { x: x + radius, y: y - radius };
    return { x: x + radius * DIAGONAL, y: y - radius * DIAGONAL };
  }

  private crosshair(g: Graphics, x: number, y: number, s: number): void {
    g.circle(x, y, 3.2 * s).fill({ color: 0xffffff, alpha: 0.95 });
    g.moveTo(x - 8 * s, y).lineTo(x + 8 * s, y).stroke({ color: 0xffffff, width: 1.1 * s, alpha: 0.85 });
    g.moveTo(x, y - 8 * s).lineTo(x, y + 8 * s).stroke({ color: 0xffffff, width: 1.1 * s, alpha: 0.85 });
  }

  private drawLabel(index: number, text: string, x: number, y: number, color: number): void {
    let label = this.labelPool[index];
    if (!label) {
      label = new Text({
        text: '',
        style: {
          fontSize: 12,
          fill: 0xffffff,
          fontFamily: 'system-ui, sans-serif',
          fontWeight: '600',
          stroke: { color: 0x000000, width: 3 },
        },
      });
      label.eventMode = 'none';
      label.anchor.set(0.5);
      this.addChild(label);
      this.labelPool[index] = label;
    }
    label.text = text;
    label.style.fill = color;
    label.position.set(x, y);
    label.scale.set(1 / this.viewScale);
    label.visible = true;
  }

  override async tearDown(): Promise<void> {
    this.dispose();
    await super.tearDown();
  }
}
