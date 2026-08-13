import { StateNode } from '../state/StateNode';
import type { CanvasKeyInfo, CanvasPinchInfo, CanvasPointerInfo, CanvasWheelInfo } from '../input/types';
import { SelectTool } from './select';
import { HandTool } from './hand';
import { DrawTool, ShapeTool, TileTool, TokenTool, WallTool } from './create';
import { MeasureTool } from './measure';
import { EraserTool } from './eraser';
import { FogPaintTool, FogRevealTool } from './fog';
import { LightTool } from './light';
import { TemplateTool } from './template';

/**
 * Raiz da máquina de estados. Contém as tools como children e cuida da
 * navegação global (wheel, pinch) e dos pans temporários (espaço / botão do meio).
 */
export class RootState extends StateNode {
  static id = 'root';
  static initial = 'select';
  static children() {
    return [SelectTool, HandTool, TokenTool, WallTool, TileTool, DrawTool, ShapeTool, MeasureTool, EraserTool, FogRevealTool, FogPaintTool, LightTool, TemplateTool];
  }

  private tempReturnTo: string | null = null;
  private tempMiddle = false;

  private static readonly HOTKEYS: Record<string, string> = {
    v: 'select',
    h: 'hand',
    t: 'token',
    w: 'wall',
    i: 'tile',
    d: 'draw',
    s: 'shape',
    m: 'measure',
    e: 'eraser',
    f: 'fogReveal',
    g: 'fogPaint',
    l: 'light',
    b: 'template',
  };

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
    if (info.button === 2 && info.ctrlKey && this.current?.id !== 'select') {
      this.transition('select');
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
      const tool = RootState.HOTKEYS[key];
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
