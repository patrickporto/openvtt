import { StateNode, type StateNodeConstructor } from '../state/StateNode';
import type { CanvasKeyInfo, CanvasPinchInfo, CanvasPointerInfo, CanvasWheelInfo } from '../input/types';
import { SelectTool } from './select';
import { HandTool } from './hand';
import { EraserTool } from './eraser';

/**
 * Raiz da máquina de estados. Contém as tools como children e cuida da
 * navegação global (wheel, pinch) e dos pans temporários (espaço / botão do meio).
 * Tools de plugins entram via `extraTools`/`extraHotkeys` (preenchidos pelo
 * ToolManager antes da construção).
 */
export class RootState extends StateNode {
  static id = 'root';
  static initial = 'select';

  static extraTools: StateNodeConstructor[] = [];
  static extraHotkeys: Record<string, string> = {};

  static children() {
    return [SelectTool, HandTool, EraserTool, ...RootState.extraTools];
  }

  private tempReturnTo: string | null = null;
  private tempMiddle = false;

  override onWheel(info: CanvasWheelInfo): void {
    this.canvas.viewport?.applyWheel(info.screenPoint, info.delta, info.zoom);
  }

  override onPinch(info: CanvasPinchInfo): void {
    this.canvas.viewport?.pinchAt(info.screenCenter, info.scaleDelta, info.delta);
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    if (info.button === 1 && !this.tempReturnTo) {
      this.tempReturnTo = this.current?.id ?? 'select';
      this.tempMiddle = true;
      this.transition('hand');
    }
  }

  override onPointerUp(info: CanvasPointerInfo): void {
    if (this.tempMiddle && info.button === 1) {
      const back = this.tempReturnTo ?? 'select';
      this.tempReturnTo = null;
      this.tempMiddle = false;
      this.transition(back);
    }
  }

  override onKeyDown(info: CanvasKeyInfo): void {
    if (info.code === 'Space' && !this.tempReturnTo) {
      this.tempReturnTo = this.current?.id ?? 'select';
      this.transition('hand');
      return;
    }
    if (info.accelKey && !info.altKey) {
      const key = info.key.toLowerCase();
      if (key === 'z') {
        if (info.shiftKey) this.canvas.redo();
        else this.canvas.undo();
        return;
      }
      if (key === 'y') {
        this.canvas.redo();
        return;
      }
    }
    if (!info.ctrlKey && !info.metaKey && !info.altKey) {
      const key = info.key.toLowerCase();
      if (key === 'q') {
        const point = this.canvas.inputs.getCurrentWorldPoint();
        this.canvas.ping(point.x, point.y);
        return;
      }
      const tool = RootState.extraHotkeys[key];
      if (tool) this.transition(tool);
    }
  }

  override onKeyUp(info: CanvasKeyInfo): void {
    if (info.code === 'Space' && this.tempReturnTo && !this.tempMiddle) {
      const back = this.tempReturnTo;
      this.tempReturnTo = null;
      this.transition(back);
    }
  }
}
