import { Tool } from './Tool';
import type { CanvasPointerInfo } from '../input/types';
import { toHex } from '../utils';

/** Posiciona luzes ambiente. Clique simples cria com as opções atuais. */
export class LightTool extends Tool {
  static id = 'light';

  override onEnter(): void {
    this.setCursor('crosshair');
  }

  override onExit(): void {
    this.preview.clear();
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    this.preview.clear();
    this.preview.ghostToken(info.point.x, info.point.y, 12, toHex(this.options.light.color));
  }

  override onPointerUp(info: CanvasPointerInfo): void {
    if (this.inputs.isDragging) return;
    void this.canvas.lights.create({
      x: info.point.x,
      y: info.point.y,
      dim: this.options.light.dim,
      bright: this.options.light.bright,
      color: this.options.light.color,
    });
  }
}
