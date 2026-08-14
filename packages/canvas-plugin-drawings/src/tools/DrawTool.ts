import { Tool, toHex, type CanvasPointerInfo, type Point } from '@openvtt/canvas';
import type { DrawToolOptions } from '../plugin';

class DrawIdle extends Tool {
  static id = 'idle';

  override onEnter(): void {
    this.setCursor('crosshair');
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    this.parent?.transition('drawing', info.point);
  }
}

class DrawDrawing extends Tool {
  static id = 'drawing';
  private points: number[] = [];

  override onEnter(info?: unknown): void {
    const p = info as Point;
    this.points = [p.x, p.y];
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    this.points.push(info.point.x, info.point.y);
    const g = this.preview.graphics;
    g.clear();
    const { color, width } = this.toolOptions<DrawToolOptions>('draw');
    if (this.points.length >= 4) {
      g.moveTo(this.points[0], this.points[1]);
      for (let i = 2; i < this.points.length; i += 2) g.lineTo(this.points[i], this.points[i + 1]);
      g.stroke({ color: toHex(color), width: width ?? 4, alpha: 0.9 });
    }
  }

  override onPointerUp(): void {
    const { color, width } = this.toolOptions<DrawToolOptions>('draw');
    if (this.points.length >= 4) {
      void this.canvas.documents.create('drawing', {
        type: 'brush',
        x: 0,
        y: 0,
        points: [...this.points],
        strokeColor: color,
        strokeWidth: width ?? 4,
      });
    }
    this.preview.clear();
    this.parent?.transition('idle');
  }
}

export class DrawTool extends Tool {
  static id = 'draw';
  static initial = 'idle';
  static children() {
    return [DrawIdle, DrawDrawing];
  }

  override onExit(): void {
    this.preview.clear();
  }
}
