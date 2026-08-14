import { definePlugin, type PluginContext } from '@openvtt/canvas';
import { AmbientLight } from './placeables/AmbientLight';
import { LightTool } from './tools/LightTool';
import { LightDataSchema, type LightData } from './schemas';

export interface LightToolOptions {
  dim: number;
  bright: number;
  color: number | string;
}

const DEFAULTS: LightToolOptions = { dim: 8, bright: 2, color: 0xffb35c };

export const lightsPlugin = definePlugin({
  id: 'lights',
  name: 'Lights',
  install(ctx: PluginContext) {
    const layer = ctx.registerDocumentType<LightData>({
      type: 'light',
      schema: LightDataSchema,
      placeable: AmbientLight,
      layer: { label: 'Lights', order: 550 },
      sceneKey: 'lights',
      behavior: {},
    });

    ctx.registerTool({ tool: LightTool, hotkey: 'l', defaults: { ...DEFAULTS } });

    const grid = () => ctx.canvas.grid.size;

    ctx.bus.tap('light:sources', 'lights', (payload) => {
      for (const obj of layer.placeables) {
        const doc = obj.document;
        payload.sources.push({
          x: obj.x,
          y: obj.y,
          dim: doc.dim * grid(),
          bright: (doc.bright ?? 0) * grid(),
          color: doc.color,
        });
      }
      return payload;
    });
  },
});
