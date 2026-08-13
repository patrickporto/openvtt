import { Graphics, Text } from 'pixi.js';
import { CanvasLayer, type CanvasLayerOptions } from '../layers/CanvasLayer';
import { CONFIG } from '../config';
import { flattenSegment, type SegmentSpec } from '../geometry';
import type { WallSegmentData } from '../schemas';
import type { Canvas } from '../canvas';

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

  ghostSegment(x1: number, y1: number, x2: number, y2: number, color = CONFIG.wall.color): void {
    this.graphics.moveTo(x1, y1).lineTo(x2, y2).stroke({ color, width: CONFIG.wall.width, alpha: 0.7 });
    this.graphics.circle(x1, y1, 4).fill({ color, alpha: 0.9 });
    this.graphics.circle(x2, y2, 4).fill({ color, alpha: 0.9 });
  }

  ghostCurve(seg: SegmentSpec, color = CONFIG.wall.color): void {
    const points = flattenSegment(seg as WallSegmentData);
    this.graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) this.graphics.lineTo(points[i].x, points[i].y);
    this.graphics.stroke({ color, width: CONFIG.wall.width, alpha: 0.7 });
    this.graphics.circle(seg.x1, seg.y1, 4).fill({ color, alpha: 0.9 });
    this.graphics.circle(seg.x2, seg.y2, 4).fill({ color, alpha: 0.9 });
    const controls: [number | undefined, number | undefined][] = [
      [seg.cp1x, seg.cp1y],
      [seg.cp2x, seg.cp2y],
    ];
    for (const [cx, cy] of controls) {
      if (cx === undefined || cy === undefined) continue;
      this.graphics.moveTo(seg.x1, seg.y1).lineTo(cx, cy).stroke({ color, width: 1, alpha: 0.35 });
      this.graphics.moveTo(seg.x2, seg.y2).lineTo(cx, cy).stroke({ color, width: 1, alpha: 0.35 });
      this.graphics.rect(cx - 4, cy - 4, 8, 8).stroke({ color, width: 1.5, alpha: 0.9 });
    }
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

  ghostPolyline(points: { x: number; y: number }[], color = 0x4fc3f7): void {
    if (points.length < 2) return;
    this.graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) this.graphics.lineTo(points[i].x, points[i].y);
    this.graphics.stroke({ color, width: 2, alpha: 0.95 });
    for (const p of points) this.graphics.circle(p.x, p.y, 4).fill({ color });
  }

  ruler(x1: number, y1: number, x2: number, y2: number, text: string): void {
    const color = 0x4fc3f7;
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
