import { CORE_LAYER_ORDER, definePlugin } from '@openvtt/canvas';
import type { CanvasPlugin, GridType } from '@openvtt/canvas';
import { GridLayer } from './GridLayer';
import { registerGridTypeContextMenu } from './context';

export interface GridTypePluginDef {
  /** Tipo de grid renderizado por este plugin ('none' registra só o toggle). */
  type: GridType;
  id?: string;
  name?: string;
  layerLabel?: string;
}

/**
 * Fábrica de plugins por tipo de grid. Cada plugin registra uma layer que só
 * é visível quando `canvas.grid.type` é o seu tipo — instalou só o square,
 * só square renderiza; instalou vários, `grid.setType()` alterna entre eles.
 * O estado (tamanho, estilo, snapping) permanece no `GridService` do core.
 * `type: 'none'` não cria layer: contribui apenas o toggle "No grid".
 */
export function createGridTypePlugin(def: GridTypePluginDef): CanvasPlugin {
  const pluginId = def.id ?? `grid-${def.type}`;
  return definePlugin({
    id: pluginId,
    name: def.name ?? `Grid · ${def.type}`,
    install(ctx) {
      const canvas = ctx.canvas;
      if (def.type !== 'none') {
        const layer = new GridLayer({
          name: pluginId,
          zIndex: CORE_LAYER_ORDER.grid,
          grid: canvas.grid.snapshot(),
        });
        layer.visible = canvas.grid.type === def.type;
        ctx.registerLayer({
          id: pluginId,
          label: def.layerLabel ?? `Grid · ${def.type}`,
          layer,
          order: CORE_LAYER_ORDER.grid,
          visible: layer.visible,
        });
        ctx.bus.on('grid:change', ({ grid }) => {
          layer.setGrid(grid);
          layer.visible = grid.type === def.type;
        });
        ctx.bus.tap('scene:setup', pluginId, ({ width, height }) => layer.setSize(width, height));
        ctx.bus.tap('scene:teardown', pluginId, () => void layer.tearDown());
      }
      registerGridTypeContextMenu(ctx, pluginId, def.type);
    },
  });
}

/** Toggle "No grid" — desativa a renderização sem desinstalar os tipos. */
export const gridNonePlugin: CanvasPlugin = createGridTypePlugin({
  type: 'none',
  name: 'Grid · None',
});
