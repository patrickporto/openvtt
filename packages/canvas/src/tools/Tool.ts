import { StateNode } from '../state/StateNode';
import type { Canvas } from '../canvas';
import type { Point } from '../input/types';
import type { DrawingType, TemplateShape } from '../schemas';

export type WallDrawMode = 'line' | 'freehand' | 'quadratic' | 'cubic' | 'ellipse' | 'rectangle';

/** Opções mutáveis que a UI pode ajustar por tool (barra de opções do playground). */
export interface ToolOptions {
  token: { size: number; texture?: string; label?: string; tint?: number | string };
  wall: { door: boolean; mode: WallDrawMode; segments: number; sideSegments: number; tolerance: number };
  tile: { width: number; height: number; texture?: string };
  draw: { color: number | string; width: number };
  shape: { kind: Extract<DrawingType, 'rect' | 'ellipse'>; color: number | string; fillAlpha: number; strokeWidth: number };
  fog: { brushSize: number };
  light: { dim: number; bright: number; color: number | string };
  template: { shape: TemplateShape; distance: number; width: number; color: number | string; fillAlpha: number };
}

export function defaultToolOptions(): ToolOptions {
  return {
    token: { size: 1 },
    wall: { door: false, mode: 'line', segments: 16, sideSegments: 1, tolerance: 8 },
    tile: { width: 2, height: 2 },
    draw: { color: 0xf59e0b, width: 4 },
    shape: { kind: 'rect', color: 0x8fb573, fillAlpha: 0.18, strokeWidth: 2 },
    fog: { brushSize: 100 },
    light: { dim: 8, bright: 2, color: 0xffb35c },
    template: { shape: 'circle', distance: 4, width: 1, color: 0x4fc3f7, fillAlpha: 0.25 },
  };
}

/** Base com helpers compartilhados pelas tools. */
export abstract class Tool extends StateNode {
  get preview() {
    return this.canvas.preview;
  }
  get viewport() {
    return this.canvas.viewport;
  }
  get inputs() {
    return this.canvas.inputs;
  }
  get options(): ToolOptions {
    return this.canvas.tools.options;
  }

  setCursor(cursor: string): void {
    this.canvas.setCursor(cursor);
  }

  snap(point: Point): Point {
    return this.canvas.snapToGrid(point.x, point.y);
  }

  snapIntersection(point: Point): Point {
    return this.canvas.snapToIntersection(point.x, point.y);
  }

  protected backToSelect(): void {
    this.canvas.setCurrentTool('select');
  }

  override onKeyDown(info: { key: string }): void {
    if (info.key === 'Escape' && this.isActiveLeaf) {
      this.onEscape();
    }
  }

  protected onEscape(): void {
    this.backToSelect();
  }
}
