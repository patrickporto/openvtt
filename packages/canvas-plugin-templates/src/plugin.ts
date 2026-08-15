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
}

const DEFAULTS: TemplateToolOptions = { shape: 'circle', distance: 4, width: 1, color: 0x4fc3f7, fillAlpha: 0.25 };

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
      behavior: {},
    });

    ctx.registerTool({ tool: TemplateTool, hotkey: 'b', defaults: { ...DEFAULTS } });

    registerTemplatesContextMenu(ctx);
  },
});
