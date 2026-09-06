import { Tool, toHex, type CanvasPointerInfo } from '@openvtt/canvas';
import type { RollTablesRegistry } from '../registry';
import type { RollTableToolOptions } from '../plugin';

export class RollTableTool extends Tool {
  static id = 'roll-table';
  static registry: RollTablesRegistry | undefined;

  private options_(): RollTableToolOptions {
    return this.toolOptions<RollTableToolOptions>('roll-table');
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
    const registry = RollTableTool.registry;
    if (!registry) return;
    const options = this.options_();
    const table = registry.get(options.tableId) ?? registry.list()[0];
    if (!table) return;
    void this.canvas.documents.create('roll-table', {
      x: info.point.x,
      y: info.point.y,
      tableId: table.id,
      label: table.name,
      color: options.color,
    });
  }
}
