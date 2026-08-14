import { Tool, toHex, type CanvasPointerInfo } from '@openvtt/canvas';
import type { LightToolOptions } from '../plugin';

export class LightTool extends Tool {
  static id = 'light';

  private options_(): LightToolOptions {
    return this.toolOptions<LightToolOptions>('light');
  }

  override onEnter(): void {
    this.setCursor('crosshair');
  }

  override onExit(): void {
    this.preview.clear();
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    this.preview.clear();
    this.preview.ghostToken(info.point.x, info.point.y, 12, toHex(this.options_().color));
  }

  override onPointerUp(info: CanvasPointerInfo): void {
    if (this.inputs.isDragging) return;
    const { dim, bright, color } = this.options_();
    void this.canvas.documents.create('light', {
      x: info.point.x,
      y: info.point.y,
      dim,
      bright,
      color,
    });
  }
}
