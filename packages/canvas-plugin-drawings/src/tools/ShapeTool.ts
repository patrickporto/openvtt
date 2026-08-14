import { Tool, type CanvasPointerInfo, type Point } from '@openvtt/canvas';
import type { ShapeToolOptions } from '../plugin';

function normalizeRect(a: Point, b: Point): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

class ShapeIdle extends Tool {
  static id = 'idle';

  override onEnter(): void {
    this.setCursor('crosshair');
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    this.parent?.transition('dragging', this.snapIntersection(info.point));
  }
}

class ShapeDragging extends Tool {
  static id = 'dragging';
  private start: Point = { x: 0, y: 0 };

  override onEnter(info?: unknown): void {
    this.start = info as Point;
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    const rect = normalizeRect(this.start, this.snapIntersection(info.point));
    this.preview.clear();
    this.preview.ghostRect(rect.x, rect.y, rect.width, rect.height);
  }

  override onPointerUp(info: CanvasPointerInfo): void {
    const rect = normalizeRect(this.start, this.snapIntersection(info.point));
    if (rect.width >= 4 && rect.height >= 4) {
      const { kind, color, fillAlpha, strokeWidth } = this.toolOptions<ShapeToolOptions>('shape');
      void this.canvas.documents.create('drawing', {
        type: kind ?? 'rect',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        fillColor: color,
        fillAlpha,
        strokeColor: color,
        strokeWidth,
      });
    }
    this.preview.clear();
    this.parent?.transition('idle');
  }
}

export class ShapeTool extends Tool {
  static id = 'shape';
  static initial = 'idle';
  static children() {
    return [ShapeIdle, ShapeDragging];
  }

  override onExit(): void {
    this.preview.clear();
  }
}
