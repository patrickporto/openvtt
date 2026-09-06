import { Tool, toHex, type CanvasPointerInfo } from '@openvtt/canvas';
import type { SoundToolOptions } from '../plugin';

export class SoundTool extends Tool {
  static id = 'sound';

  private options_(): SoundToolOptions {
    return this.toolOptions<SoundToolOptions>('sound');
  }

  override onEnter(): void {
    this.setCursor('crosshair');
  }

  override onExit(): void {
    this.preview.clear();
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    this.preview.clear();
    const radius = this.options_().radius * this.canvas.grid.size;
    this.preview.ghostToken(info.point.x, info.point.y, radius, toHex(0x63e2b7));
  }

  override onPointerUp(info: CanvasPointerInfo): void {
    if (this.inputs.isDragging) return;
    const { src, radius, volume, channel, loop } = this.options_();
    void this.canvas.documents.create('sound', {
      x: info.point.x,
      y: info.point.y,
      src,
      radius,
      volume,
      channel,
      loop,
    });
  }
}
