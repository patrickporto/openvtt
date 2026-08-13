import { Tool } from './Tool';
import type { CanvasPointerInfo, Point } from '../input/types';

/** Base das tools de pincel de fog: fantasma circular segue o cursor, drag aplica. */
abstract class FogBrushTool extends Tool {
  protected abstract readonly brushColor: number;

  override onEnter(): void {
    this.setCursor('crosshair');
  }

  override onExit(): void {
    this.preview.clear();
  }

  protected get brushRadius(): number {
    return this.options.fog.brushSize / 2;
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    this.applyBrush(info.point);
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    this.preview.clear();
    this.preview.ghostToken(info.point.x, info.point.y, this.brushRadius, this.brushColor);
    if (this.inputs.isDragging) this.applyBrush(info.point);
  }

  protected abstract applyBrush(point: Point): void;
}

/** Revela fog (apaga pintura manual e marca como explorado). */
export class FogRevealTool extends FogBrushTool {
  static id = 'fogReveal';
  protected readonly brushColor = 0x4fc3f7;

  protected applyBrush(point: Point): void {
    this.canvas.fog.revealFog(point.x, point.y, this.brushRadius);
  }
}

/** Pinta fog manualmente (Simple Fog). */
export class FogPaintTool extends FogBrushTool {
  static id = 'fogPaint';
  protected readonly brushColor = 0x20202c;

  protected applyBrush(point: Point): void {
    this.canvas.fog.paintFog(point.x, point.y, this.brushRadius);
  }
}
