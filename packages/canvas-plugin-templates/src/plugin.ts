import { definePlugin, type PluginContext } from '@openvtt/canvas';
import { AoETemplate } from './placeables/AoETemplate';
import { TemplateTool } from './tools/TemplateTool';
import { registerTemplatesContextMenu } from './context';
import { TemplateDataSchema, type TemplateData, type TemplateShape } from './schemas';

export interface TemplateToolOptions {
  shape: TemplateShape;
  distance: number;
  width: number;
  color: number | string;
  fillAlpha: number;
  snap: boolean;
}

const DEFAULTS: TemplateToolOptions = { shape: 'circle', distance: 4, width: 1, color: 0x4fc3f7, fillAlpha: 0.25, snap: true };

export const templatesPlugin = definePlugin({
  id: 'templates',
  name: 'Templates',
  install(ctx: PluginContext) {
    ctx.registerDocumentType<TemplateData>({
      type: 'template',
      schema: TemplateDataSchema,
      placeable: AoETemplate,
      layer: { label: 'Templates', order: 400 },
      sceneKey: 'templates',
      transform: {
        snapshotFields(obj) {
          const doc = obj.document;
          return { x: obj.x, y: obj.y, direction: doc.direction ?? 0, distance: doc.distance, width: doc.width ?? 1 };
        },
        applyResize(obj, rect) {
          const doc = obj.document;
          const aabb = obj.getAABB();
          const w = aabb.maxX - aabb.minX;
          const h = aabb.maxY - aabb.minY;
          if (w <= 0 || h <= 0) return null;
          const scale = (rect.width / w + rect.height / h) / 2;
          const u = (obj.x - aabb.minX) / w;
          const v = (obj.y - aabb.minY) / h;
          const changes: Partial<TemplateData> = {
            x: rect.x + u * rect.width,
            y: rect.y + v * rect.height,
            distance: Math.max(0.5, doc.distance * scale),
          };
          if (doc.shape === 'ray') changes.width = Math.max(0.5, (doc.width ?? 1) * scale);
          return changes;
        },
        rotationField: 'direction',
        rotationPivot(obj) {
          return { x: obj.x, y: obj.y };
        },
      },
      behavior: {},
    });

    ctx.registerTool({ tool: TemplateTool, hotkey: 'b', defaults: { ...DEFAULTS } });

    registerTemplatesContextMenu(ctx);
  },
});
