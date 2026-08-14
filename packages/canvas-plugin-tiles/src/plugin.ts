import { definePlugin, type PluginContext } from '@openvtt/canvas';
import { Tile } from './placeables/Tile';
import { TileTool } from './tools/TileTool';
import { TileDataSchema, type TileData } from './schemas';

export interface TileToolOptions {
  width: number;
  height: number;
  texture?: string;
}

const DEFAULTS: TileToolOptions = { width: 2, height: 2 };

export const tilesPlugin = definePlugin({
  id: 'tiles',
  name: 'Tiles',
  install(ctx: PluginContext) {
    ctx.registerDocumentType<TileData>({
      type: 'tile',
      schema: TileDataSchema,
      placeable: Tile,
      layer: { label: 'Tiles', order: 100 },
      sceneKey: 'tiles',
      transform: {
        snapshotFields(obj) {
          const doc = obj.document;
          return { x: obj.x, y: obj.y, width: doc.width, height: doc.height, rotation: doc.rotation ?? 0 };
        },
        applyResize(obj, rect) {
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        },
      },
      behavior: {},
    });

    ctx.registerTool({ tool: TileTool, hotkey: 'i', defaults: { ...DEFAULTS } });
  },
});
