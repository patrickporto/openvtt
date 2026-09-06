import { Graphics, Text } from 'pixi.js';
import { CanvasLayer, type CanvasLayerOptions } from '../layers/CanvasLayer';
import { CONFIG } from '../config';
import type { CellShape } from '../grid';
import type { Canvas } from '../canvas';

const RULER_COLOR = 0x4fc3f7;

/**
 * Camada de overlays transitórios (fantasmas de posicionamento, marquee de
 * seleção, régua de medição). Sempre no topo, nunca interativa.
 */
export class PreviewLayer extends CanvasLayer {
  readonly graphics = new Graphics();
  private readonly rulerLabel: Text;
  private viewScale = 1;

  constructor(options: CanvasLayerOptions, canvas?: Canvas) {
    super({ ...options, interactive: false });
    this.graphics.eventMode = 'none';
    this.rulerLabel = new Text({
      text: '',
      style: {
        fontSize: 13,
        fill: 0xffffff,
        fontFamily: 'system-ui, sans-serif',
        fontWeight: '600',
        stroke: { color: 0x000000, width: 3 },
      },
    });
    this.rulerLabel.eventMode = 'none';
    this.rulerLabel.visible = false;
    this.addChild(this.graphics, this.rulerLabel);
    if (canvas) {
      this.viewScale = canvas.viewport?.scale ?? 1;
      canvas.bus.on('zoom', ({ scale }) => {
        this.viewScale = scale;
        this.rulerLabel.scale.set(1 / scale);
      });
    }
  }

  clear(): void {
    this.graphics.clear();
    this.hideLabel();
  }

  showLabel(text: string, x: number, y: number): void {
    this.rulerLabel.text = text;
    this.rulerLabel.position.set(x, y);
    this.rulerLabel.scale.set(1 / this.viewScale);
    this.rulerLabel.visible = true;
  }

  hideLabel(): void {
    this.rulerLabel.visible = false;
  }

  ghostToken(x: number, y: number, radius: number, color = CONFIG.token.fallbackColor): void {
    this.graphics.circle(x, y, radius).fill({ color, alpha: 0.35 });
    this.graphics.circle(x, y, radius).stroke({ color, width: 2, alpha: 0.9 });
  }

  ghostSegment(x1: number, y1: number, x2: number, y2: number, color = CONFIG.wall.color, width = CONFIG.wall.width): void {
    this.graphics.moveTo(x1, y1).lineTo(x2, y2).stroke({ color, width, alpha: 0.7 });
    this.graphics.circle(x1, y1, 4).fill({ color, alpha: 0.9 });
    this.graphics.circle(x2, y2, 4).fill({ color, alpha: 0.9 });
  }

  ghostPolylineRaw(points: { x: number; y: number }[], color = CONFIG.wall.color, width = CONFIG.wall.width, showDots = true): void {
    if (points.length < 2) return;
    this.graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) this.graphics.lineTo(points[i].x, points[i].y);
    this.graphics.stroke({ color, width, alpha: 0.7 });
    if (showDots) for (const p of points) this.graphics.circle(p.x, p.y, 4).fill({ color, alpha: 0.9 });
  }

  ghostRect(x: number, y: number, width: number, height: number, color = CONFIG.selection.color): void {
    this.graphics.rect(x, y, width, height).fill({ color, alpha: 0.15 });
    this.graphics.rect(x, y, width, height).stroke({ color, width: 1.5, alpha: 0.9 });
  }

  marquee(x: number, y: number, width: number, height: number): void {
    this.graphics.rect(x, y, width, height).fill({ color: CONFIG.selection.color, alpha: 0.08 });
    this.graphics.rect(x, y, width, height).stroke({ color: CONFIG.selection.color, width: 1, alpha: 0.7 });
  }

  ghostPolygon(points: { x: number; y: number }[], color = CONFIG.selection.color): void {
    if (points.length < 3) return;
    const flat = points.flatMap((p) => [p.x, p.y]);
    this.graphics.poly(flat).fill({ color, alpha: 0.18 });
    this.graphics.poly(flat).stroke({ color, width: 2, alpha: 0.8 });
  }

  ghostCell(shape: CellShape, color = RULER_COLOR): void {
    if (shape.type === 'rect') {
      const [x, y, width, height] = shape.data;
      this.graphics.rect(x, y, width, height).fill({ color, alpha: 0.12 });
      this.graphics.rect(x, y, width, height).stroke({ color, width: 1.5, alpha: 0.55 });
      return;
    }
    this.graphics.poly(shape.data).fill({ color, alpha: 0.12 });
    this.graphics.poly(shape.data).stroke({ color, width: 1.5, alpha: 0.55 });
  }

  ghostPolyline(points: { x: number; y: number }[], color = RULER_COLOR): void {
    if (points.length < 2) return;
    this.graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) this.graphics.lineTo(points[i].x, points[i].y);
    this.graphics.stroke({ color, width: 2, alpha: 0.95 });
    for (const p of points) this.graphics.circle(p.x, p.y, 4).fill({ color });
  }

  ruler(x1: number, y1: number, x2: number, y2: number, text: string): void {
    const color = RULER_COLOR;
    this.graphics.moveTo(x1, y1).lineTo(x2, y2).stroke({ color, width: 2, alpha: 0.95 });
    this.graphics.circle(x1, y1, 4).fill({ color });
    this.graphics.circle(x2, y2, 4).fill({ color });
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    this.showLabel(text, mx + 10, my - 26);
  }

  override async tearDown(): Promise<void> {
    this.clear();
  }
}
