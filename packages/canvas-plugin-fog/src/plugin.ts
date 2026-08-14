import * as v from 'valibot';
import { definePlugin, type PluginContext } from '@openvtt/canvas';
import { FogOfWarLayer } from './FogOfWarLayer';
import { createFogTools, type FogToolOptions } from './tools/fog';

const DEFAULT_TOOL_OPTIONS: FogToolOptions = { brushSize: 100 };

export const fogPlugin = definePlugin({
  id: 'fog',
  name: 'Fog of War',
  install(ctx: PluginContext) {
    const fogLayer = new FogOfWarLayer(ctx.canvas);

    ctx.registerLayer({ id: 'fog', label: 'Fog of War', layer: fogLayer, order: 800, visible: false });

    ctx.bus.registerEvent(
      'fog:change',
      v.object({ enabled: v.boolean(), darkness: v.number(), playerView: v.boolean() }),
    );

    ctx.bus.tap('scene:setup', 'fog', ({ width, height }) => fogLayer.setup(width, height));
    ctx.bus.tap('scene:teardown', 'fog', () => void fogLayer.tearDown());
    ctx.bus.tap('scene:refresh', 'fog', () => fogLayer.compose());

    ctx.bus.on('document:create', () => fogLayer.refresh());
    ctx.bus.on('document:update', () => fogLayer.refresh());
    ctx.bus.on('document:delete', () => fogLayer.refresh());
    ctx.bus.on('document:moved', () => fogLayer.refresh());
    ctx.bus.on('selection:change', () => fogLayer.compose());

    const { FogRevealTool, FogPaintTool } = createFogTools(fogLayer);
    ctx.registerTool({ tool: FogRevealTool, hotkey: 'f', defaults: { ...DEFAULT_TOOL_OPTIONS } });
    ctx.registerTool({ tool: FogPaintTool, hotkey: 'g', defaults: { ...DEFAULT_TOOL_OPTIONS } });

    ctx.onDispose(() => void fogLayer.tearDown());
  },
});
