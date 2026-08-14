import { StateNode } from '../state/StateNode';
import type { Canvas } from '../canvas';
import type { Point } from '../input/types';
import type { ToolOptions } from './ToolManager';

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
  /** Opções por id de tool — plugins leem as suas com `toolOptions<T>()`. */
  get options(): ToolOptions {
    return this.canvas.tools.options;
  }

  /** Opções tipadas da tool atual (ou de outra, pelo id). */
  toolOptions<T extends object>(id?: string): T {
    const key = id ?? this.id;
    return (this.canvas.tools.options[key] ?? {}) as T;
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
    if (info.key === 'Escape') {
      this.onEscape();
    }
  }

  protected onEscape(): void {
    this.backToSelect();
  }
}
