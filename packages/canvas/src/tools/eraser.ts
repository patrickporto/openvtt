import { Tool } from './Tool';
import type { CanvasPointerInfo } from '../input/types';

export class EraserTool extends Tool {
  static id = 'eraser';

  override onEnter(): void {
    this.setCursor('pointer');
  }

  override onExit(): void {
    this.preview.clear();
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    if (info.target.type === 'object') this.canvas.deleteObject(info.target.object);
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    const object = this.canvas.pick(info.point);
    this.preview.clear();
    if (object) {
      const b = object.getAABB();
      this.preview.ghostRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY, 0xef4444);
      if (this.inputs.isDragging) this.canvas.deleteObject(object);
    }
  }
}
