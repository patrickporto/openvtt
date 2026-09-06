import { StateNode, type StateNodeConstructor } from '../state/StateNode';
import type { CanvasPinchInfo, CanvasPointerInfo, CanvasWheelInfo } from '../input/types';
import { SelectTool } from './select';
import { HandTool } from './hand';
import { EraserTool } from './eraser';

/**
 * Raiz da máquina de estados. Contém as tools como children e cuida da
 * navegação global (wheel, pinch) e do pan temporário pelo botão do meio.
 * Tools de plugins entram via `extraTools` (preenchido pelo ToolManager
 * antes da construção). Teclas de tool/undo/redo/ping/espaço são geridas
 * pelo `@openvtt/hotkeys` via ToolManager.
 */
export class RootState extends StateNode {
  static id = 'root';
  static initial = 'select';

  static extraTools: StateNodeConstructor[] = [];

  static children() {
    return [SelectTool, HandTool, EraserTool, ...RootState.extraTools];
  }

  override onWheel(info: CanvasWheelInfo): void {
    if (this.activeLeafCapturesWheel()) return;
    this.canvas.viewport?.applyWheel(info.screenPoint, info.delta, info.zoom);
  }

  /**
   * Convenção de captura: quando a folha ativa da tool sobrescreve
   * `onWheel` (ex.: rotação de template durante o placement), o zoom do
   * viewport é suprimido — o gesto pertence à tool.
   */
  private activeLeafCapturesWheel(): boolean {
    let node: StateNode | null = this.current;
    while (node && !node.isActiveLeaf) node = node.current;
    return node !== null && node.onWheel !== StateNode.prototype.onWheel;
  }

  override onPinch(info: CanvasPinchInfo): void {
    this.canvas.viewport?.pinchAt(info.screenCenter, info.scaleDelta, info.delta);
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    if (info.button === 1) this.canvas.tools.beginTempPan('middle');
  }

  override onPointerUp(info: CanvasPointerInfo): void {
    if (info.button === 1) this.canvas.tools.endTempPan('middle');
  }
}
