import * as v from 'valibot';
import { definePlugin, type PluginContext } from '@openvtt/canvas';
import { MeasureTool } from './tools/MeasureTool';

export const MeasureEventSchema = v.object({
  pixels: v.number(),
  units: v.number(),
  x1: v.number(),
  y1: v.number(),
  x2: v.number(),
  y2: v.number(),
  segments: v.optional(v.number()),
});

export type MeasureEventData = v.InferOutput<typeof MeasureEventSchema>;

export const measurePlugin = definePlugin({
  id: 'measure',
  name: 'Measure',
  install(ctx: PluginContext) {
    ctx.registerTool({ tool: MeasureTool, hotkey: 'm', defaults: {} });
    ctx.bus.registerEvent('measure', MeasureEventSchema);
  },
});
