import { definePlugin, type PluginContext } from '@openvtt/canvas';
import { Drawing } from './placeables/Drawing';
import { DrawTool } from './tools/DrawTool';
import { ShapeTool } from './tools/ShapeTool';
import { registerDrawingsContextMenu } from './context';
import { DrawingDataSchema, type DrawingData } from './schemas';

export interface DrawToolOptions {
  color: number | string;
  width: number;
}

export interface ShapeToolOptions {
  kind: 'rect' | 'ellipse';
  color: number | string;
  fillAlpha: number;
  strokeWidth: number;
}

const DRAW_DEFAULTS: DrawToolOptions = { color: 0xf59e0b, width: 4 };
const SHAPE_DEFAULTS: ShapeToolOptions = { kind: 'rect', color: 0x8fb573, fillAlpha: 0.18, strokeWidth: 2 };

export const drawingsPlugin = definePlugin({
  id: 'drawings',
  name: 'Drawings',
  install(ctx: PluginContext) {
    ctx.registerDocumentType<DrawingData>({
      type: 'drawing',
      schema: DrawingDataSchema,
      placeable: Drawing,
      layer: { label: 'Drawings', order: 200 },
      sceneKey: 'drawings',
      transform: {
        snapshotFields(obj) {
          const doc = obj.document;
          return { x: obj.x, y: obj.y, width: doc.width ?? 0, height: doc.height ?? 0, rotation: doc.rotation ?? 0 };
        },
        applyResize(obj, rect) {
          const doc = obj.document;
          if (doc.type !== 'rect' && doc.type !== 'ellipse') return null;
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        },
      },
      behavior: {},
    });

    ctx.registerTool({ tool: DrawTool, hotkey: 'd', defaults: { ...DRAW_DEFAULTS } });
    ctx.registerTool({ tool: ShapeTool, hotkey: 's', defaults: { ...SHAPE_DEFAULTS } });

    registerDrawingsContextMenu(ctx);
  },
});
