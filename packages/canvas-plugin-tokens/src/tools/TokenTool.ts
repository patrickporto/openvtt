import { Tool, type CanvasPointerInfo } from '@openvtt/canvas';
import type { TokenToolOptions } from '../plugin';

export class TokenTool extends Tool {
  static id = 'token';

  private options_(): TokenToolOptions {
    return this.toolOptions<TokenToolOptions>('token');
  }

  private ghost(info: CanvasPointerInfo): void {
    const p = this.snap(info.point);
    const radius = ((this.options_().size ?? 1) * this.canvas.grid.size) / 2;
    this.preview.clear();
    this.preview.ghostToken(p.x, p.y, radius);
  }

  override onEnter(): void {
    this.setCursor('crosshair');
  }

  override onExit(): void {
    this.preview.clear();
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    this.ghost(info);
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    const p = this.snap(info.point);
    const { size, texture, label, tint } = this.options_();
    void this.canvas.documents.create('token', { x: p.x, y: p.y, size, texture, label, tint });
    this.ghost(info);
  }
}
