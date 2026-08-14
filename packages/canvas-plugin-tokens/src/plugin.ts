import * as v from 'valibot';
import { definePlugin, dynamicBus, type PluginContext } from '@openvtt/canvas';
import { Token } from './placeables/Token';
import { TokenTool } from './tools/TokenTool';
import { TokenDataSchema, type TokenData } from './schemas';

export interface TokenToolOptions {
  size: number;
  texture?: string;
  label?: string;
  tint?: number | string;
}

const DEFAULTS: TokenToolOptions = { size: 1 };

/**
 * Tokens: placeable circular/texture, tool de colocação com snap, fontes de
 * visão e luz para os plugins de fog/lighting, e eventos `token:*`.
 */
export const tokensPlugin = definePlugin({
  id: 'tokens',
  name: 'Tokens',
  install(ctx: PluginContext) {
    const layer = ctx.registerDocumentType<TokenData>({
      type: 'token',
      schema: TokenDataSchema,
      placeable: Token,
      layer: { label: 'Tokens', order: 500 },
      sceneKey: 'tokens',
      transform: {
        snapshotFields(obj) {
          const doc = obj.document;
          return { x: obj.x, y: obj.y, size: doc.size ?? 1, rotation: doc.rotation ?? 0 };
        },
        applyResize(obj, rect) {
          const cx = rect.x + rect.width / 2;
          const cy = rect.y + rect.height / 2;
          const diameter = (rect.width + rect.height) / 2;
          return { x: cx, y: cy, size: diameter / ctx.canvas.grid.size };
        },
      },
      behavior: { snapToGrid: true, collides: true, rulerOnDrag: true },
    });

    ctx.bus.registerEvent('token:moved', v.object({ id: v.string(), x: v.number(), y: v.number() }));
    ctx.bus.registerEvent('token:selected', v.object({ ids: v.array(v.string()) }));

    ctx.registerTool({ tool: TokenTool, hotkey: 't', defaults: { ...DEFAULTS } });

    const grid = () => ctx.canvas.grid.size;

    ctx.bus.tap('vision:sources', 'tokens', (payload) => {
      for (const obj of layer.placeables) {
        const radius = obj.document.visionRadius ?? 0;
        if (radius > 0) payload.sources.push({ x: obj.x, y: obj.y, radius: radius * grid() });
      }
      return payload;
    });

    ctx.bus.tap('light:sources', 'tokens', (payload) => {
      for (const obj of layer.placeables) {
        const dim = obj.document.lightDim ?? 0;
        const bright = obj.document.lightBright ?? 0;
        if (dim > 0) payload.sources.push({ x: obj.x, y: obj.y, dim: dim * grid(), bright: bright * grid() });
      }
      return payload;
    });

    ctx.bus.on('selection:change', ({ ids }) => {
      const tokenIds = ids.filter((id) => layer.get(id) !== undefined);
      if (tokenIds.length > 0) {
        dynamicBus(ctx.bus).emit('token:selected', { ids: tokenIds });
      }
    });
  },
});
