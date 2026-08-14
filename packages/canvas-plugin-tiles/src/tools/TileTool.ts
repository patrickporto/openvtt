import { Tool, type CanvasPointerInfo, type Point } from '@openvtt/canvas';
import type { TileToolOptions } from '../plugin';

function normalizeRect(a: Point, b: Point): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

class TileIdle extends Tool {
  static id = 'idle';

  override onEnter(): void {
    this.setCursor('crosshair');
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    this.parent?.transition('dragging', this.snapIntersection(info.point));
  }
}

class TileDragging extends Tool {
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
    const { width, height, texture } = this.toolOptions<TileToolOptions>('tile');
    if (rect.width < 4 && rect.height < 4) {
      const size = this.canvas.grid.size;
      void this.canvas.documents.create('tile', {
        x: this.start.x,
        y: this.start.y,
        width: (width ?? 2) * size,
        height: (height ?? 2) * size,
        texture,
      });
    } else {
      void this.canvas.documents.create('tile', { x: rect.x, y: rect.y, width: rect.width, height: rect.height, texture });
    }
    this.preview.clear();
    this.parent?.transition('idle');
  }
}

export class TileTool extends Tool {
  static id = 'tile';
  static initial = 'idle';
  static children() {
    return [TileIdle, TileDragging];
  }

  override onExit(): void {
    this.preview.clear();
  }
}
