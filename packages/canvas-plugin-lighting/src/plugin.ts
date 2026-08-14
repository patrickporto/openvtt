import * as v from 'valibot';
import { definePlugin, type PluginContext } from '@openvtt/canvas';
import { LightingFxLayer } from './LightingFxLayer';

export const lightingPlugin = definePlugin({
  id: 'lighting',
  name: 'Lighting',
  install(ctx: PluginContext) {
    const lightingLayer = new LightingFxLayer(ctx.canvas);

    ctx.registerLayer({ id: 'lighting', label: 'Lighting', layer: lightingLayer, order: 750, visible: false });

    ctx.bus.registerEvent('lighting:change', v.object({ enabled: v.boolean(), darkness: v.number() }));

    ctx.bus.tap('scene:setup', 'lighting', ({ width, height }) => lightingLayer.setup(width, height));
    ctx.bus.tap('scene:teardown', 'lighting', () => void lightingLayer.tearDown());
    ctx.bus.tap('scene:refresh', 'lighting', () => lightingLayer.compose());

    ctx.bus.on('document:create', () => lightingLayer.compose());
    ctx.bus.on('document:update', () => lightingLayer.compose());
    ctx.bus.on('document:delete', () => lightingLayer.compose());
    ctx.bus.on('document:moved', () => lightingLayer.compose());
    ctx.bus.on('selection:change', () => lightingLayer.compose());

    ctx.onDispose(() => void lightingLayer.tearDown());
  },
});
